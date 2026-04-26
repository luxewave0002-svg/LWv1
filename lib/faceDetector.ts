import {
  FaceDetector as MediaPipeFaceDetector,
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FacePoint = {
  x: number;
  y: number;
};

export type FaceRegions = {
  faceBox: FaceBox;
  eyesBox: FaceBox;
  mouthBox: FaceBox;
  facePolygon?: FacePoint[];
  eyesPolygon?: FacePoint[];
  mouthPolygon?: FacePoint[];
};

type NativeDetectedFace = {
  boundingBox?: DOMRectReadOnly;
};

type NativeFaceDetectorInstance = {
  detect(input: ImageBitmapSource): Promise<NativeDetectedFace[]>;
};

type NativeFaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => NativeFaceDetectorInstance;

type Connection = {
  start: number;
  end: number;
};

const FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

let detector: MediaPipeFaceDetector | null = null;
let landmarker: FaceLandmarker | null = null;

function getNativeFaceDetectorCtor(): NativeFaceDetectorConstructor | null {
  const maybeCtor = (globalThis as typeof globalThis & {
    FaceDetector?: NativeFaceDetectorConstructor;
  }).FaceDetector;

  return maybeCtor ?? null;
}

function clampBox(box: FaceBox, imageWidth: number, imageHeight: number): FaceBox {
  const width = Math.max(1, Math.min(Math.round(box.width), imageWidth));
  const height = Math.max(1, Math.min(Math.round(box.height), imageHeight));

  return {
    x: Math.max(0, Math.min(Math.round(box.x), imageWidth - width)),
    y: Math.max(0, Math.min(Math.round(box.y), imageHeight - height)),
    width,
    height,
  };
}

function expandBox(
  box: FaceBox,
  imageWidth: number,
  imageHeight: number,
  padXRatio: number,
  padYRatio: number,
  minPadding = 0
): FaceBox {
  const padX = Math.max(minPadding, Math.round(box.width * padXRatio));
  const padY = Math.max(minPadding, Math.round(box.height * padYRatio));

  return clampBox(
    {
      x: box.x - padX,
      y: box.y - padY,
      width: box.width + padX * 2,
      height: box.height + padY * 2,
    },
    imageWidth,
    imageHeight
  );
}

function collectIndices(connections: Connection[]): number[] {
  const indices = new Set<number>();

  for (const connection of connections) {
    indices.add(connection.start);
    indices.add(connection.end);
  }

  return [...indices];
}

function boxFromLandmarks(
  landmarks: NormalizedLandmark[],
  indices: number[],
  imageWidth: number,
  imageHeight: number
): FaceBox | null {
  const points = indices
    .map(index => landmarks[index])
    .filter((landmark): landmark is NormalizedLandmark => Boolean(landmark))
    .map(landmark => ({
      x: landmark.x * imageWidth,
      y: landmark.y * imageHeight,
    }));

  if (!points.length) {
    return null;
  }

  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return clampBox(
    {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    },
    imageWidth,
    imageHeight
  );
}

function polygonFromLandmarks(
  landmarks: NormalizedLandmark[],
  indices: number[],
  imageWidth: number,
  imageHeight: number
): FacePoint[] {
  const points = indices
    .map(index => landmarks[index])
    .filter((landmark): landmark is NormalizedLandmark => Boolean(landmark))
    .map(landmark => ({
      x: landmark.x * imageWidth,
      y: landmark.y * imageHeight,
    }));

  if (points.length < 3) {
    return [];
  }

  const center = points.reduce(
    (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
    { x: 0, y: 0 }
  );

  return points
    .sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x))
    .map(point => ({
      x: Math.round(point.x),
      y: Math.round(point.y),
    }));
}

function buildFallbackRegions(faceBox: FaceBox): FaceRegions {
  const padX = Math.round(faceBox.width * 0.08);
  const padY = Math.round(faceBox.height * 0.1);
  const faceX = Math.max(0, faceBox.x - padX);
  const faceY = Math.max(0, faceBox.y - padY);
  const faceW = Math.round(faceBox.width + padX * 2);
  const faceH = Math.round(faceBox.height + padY * 1.5);

  return {
    faceBox: {
      x: faceX,
      y: faceY,
      width: faceW,
      height: faceH,
    },
    eyesBox: {
      x: Math.round(faceX + faceW * 0.14),
      y: Math.round(faceY + faceH * 0.2),
      width: Math.round(faceW * 0.72),
      height: Math.round(faceH * 0.2),
    },
    mouthBox: {
      x: Math.round(faceX + faceW * 0.22),
      y: Math.round(faceY + faceH * 0.62),
      width: Math.round(faceW * 0.56),
      height: Math.round(faceH * 0.16),
    },
  };
}

async function detectWithNativeFaceDetector(file: File): Promise<FaceBox | null> {
  const NativeFaceDetector = getNativeFaceDetectorCtor();
  if (!NativeFaceDetector) {
    return null;
  }

  const bitmap = await createImageBitmap(file);

  try {
    const faceDetector = new NativeFaceDetector({
      fastMode: true,
      maxDetectedFaces: 1,
    });

    const faces = await faceDetector.detect(bitmap);
    const box = faces[0]?.boundingBox;
    if (!box) {
      return null;
    }

    return {
      x: Math.max(0, Math.round(box.x)),
      y: Math.max(0, Math.round(box.y)),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    };
  } finally {
    bitmap.close();
  }
}

async function getDetector() {
  if (detector) return detector;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  detector = await MediaPipeFaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/face_detector.tflite",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.3,
    minSuppressionThreshold: 0.3,
  });

  return detector;
}

async function getLandmarker() {
  if (landmarker) return landmarker;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL,
    },
    runningMode: "IMAGE",
    numFaces: 1,
    minFaceDetectionConfidence: 0.35,
    minFacePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });

  return landmarker;
}

async function loadImageElement(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  const image = new Image();
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    image.src = url;
  });

  return { image, url };
}

function buildRegionsFromLandmarks(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number
): FaceRegions | null {
  const faceOvalIndices = collectIndices(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL as Connection[]);
  const eyeIndices = collectIndices([
    ...(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE as Connection[]),
    ...(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE as Connection[]),
    ...(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW as Connection[]),
    ...(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW as Connection[]),
  ]);
  const lipIndices = collectIndices(FaceLandmarker.FACE_LANDMARKS_LIPS as Connection[]);

  const faceBox = boxFromLandmarks(landmarks, faceOvalIndices, imageWidth, imageHeight);
  const eyesBox = boxFromLandmarks(landmarks, eyeIndices, imageWidth, imageHeight);
  const mouthBox = boxFromLandmarks(landmarks, lipIndices, imageWidth, imageHeight);
  const facePolygon = polygonFromLandmarks(landmarks, faceOvalIndices, imageWidth, imageHeight);
  const eyesPolygon = polygonFromLandmarks(landmarks, eyeIndices, imageWidth, imageHeight);
  const mouthPolygon = polygonFromLandmarks(landmarks, lipIndices, imageWidth, imageHeight);

  if (!faceBox || !eyesBox || !mouthBox) {
    return null;
  }

  return {
    faceBox: expandBox(faceBox, imageWidth, imageHeight, 0.06, 0.1, 6),
    eyesBox: expandBox(eyesBox, imageWidth, imageHeight, 0.22, 0.4, 8),
    mouthBox: expandBox(mouthBox, imageWidth, imageHeight, 0.22, 0.32, 6),
    facePolygon,
    eyesPolygon,
    mouthPolygon,
  };
}

async function detectWithLandmarker(file: File): Promise<FaceRegions | null> {
  const { image, url } = await loadImageElement(file);

  try {
    const marker = await getLandmarker();
    const result = marker.detect(image);
    const landmarks = result.faceLandmarks?.[0];

    if (!landmarks?.length) {
      return null;
    }

    return buildRegionsFromLandmarks(landmarks, image.naturalWidth || image.width, image.naturalHeight || image.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function detectWithBoundingBoxes(file: File): Promise<FaceRegions | null> {
  const nativeResult = await detectWithNativeFaceDetector(file);
  if (nativeResult) {
    return buildFallbackRegions(nativeResult);
  }

  const { image, url } = await loadImageElement(file);

  try {
    const fd = await getDetector();
    const result = fd.detect(image);
    const box = result.detections?.[0]?.boundingBox;
    if (!box) {
      return null;
    }

    return buildFallbackRegions({
      x: Math.max(0, Math.round(box.originX)),
      y: Math.max(0, Math.round(box.originY)),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function detectFaceRegions(file: File): Promise<FaceRegions | null> {
  const preciseResult = await detectWithLandmarker(file);
  if (preciseResult) {
    return preciseResult;
  }

  return detectWithBoundingBoxes(file);
}

export async function detectFirstFace(file: File): Promise<FaceBox | null> {
  const result = await detectFaceRegions(file);
  return result?.faceBox ?? null;
}
