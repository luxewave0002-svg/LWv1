import { prisma } from './prisma'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8)

export async function generateInviteCode(inviterId: string): Promise<string> {
  let code: string
  let exists = true

  do {
    code = nanoid()
    const existing = await prisma.inviteLog.findUnique({ where: { inviteCode: code } })
    exists = !!existing
  } while (exists)

  await prisma.inviteLog.create({ data: { inviterId, inviteCode: code } })
  return code
}

export async function bindInviteCode(code: string, inviteeId: string) {
  const log = await prisma.inviteLog.findUnique({ where: { inviteCode: code } })
  if (!log || log.inviteeId) return null

  return await prisma.inviteLog.update({
    where: { inviteCode: code },
    data: { inviteeId, joinedAt: new Date() },
  })
}

export type TreeNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    referralCode: string
    depth: number
    joinedAt: Date | null
  }
}

export type TreeEdge = {
  id: string
  source: string
  target: string
  animated: boolean
}

export async function getTreeNodes(
  rootUserId: string
): Promise<{ nodes: TreeNode[]; edges: TreeEdge[]; total: number }> {
  type Row = {
    id: string
    name: string | null
    referral_code: string
    depth: number
    referrer_id: string | null
    joined_at: Date | null
  }

  const rows = await prisma.$queryRaw<Row[]>`
    WITH RECURSIVE tree AS (
      SELECT
        u.id, u.name, u.referral_code,
        0 AS depth, u.referrer_id,
        il.joined_at
      FROM users u
      LEFT JOIN invite_logs il ON il.invitee_id = u.id
      WHERE u.id = ${rootUserId}

      UNION ALL

      SELECT
        u.id, u.name, u.referral_code,
        t.depth + 1, u.referrer_id,
        il.joined_at
      FROM tree t
      JOIN users u ON u.referrer_id = t.id
      LEFT JOIN invite_logs il ON il.invitee_id = u.id
      WHERE t.depth < 30
    )
    SELECT * FROM tree ORDER BY depth, name
  `

  const nodes: TreeNode[] = rows.map((row) => ({
    id: row.id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: {
      label: row.name ?? '(名前なし)',
      referralCode: row.referral_code,
      depth: row.depth,
      joinedAt: row.joined_at,
    },
  }))

  const edges: TreeEdge[] = rows
    .filter((row) => row.referrer_id)
    .map((row) => ({
      id: `e-${row.referrer_id}-${row.id}`,
      source: row.referrer_id!,
      target: row.id,
      animated: false,
    }))

  return { nodes, edges, total: rows.length }
}
