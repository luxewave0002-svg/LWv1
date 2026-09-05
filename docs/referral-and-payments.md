# 紹介ポイントと決済の仕組み

2026-09 に実装した紹介ポイント機能と、URL決済による支払い管理の記録。

---

## 1. ポイント付与ルール

| きっかけ | 付与先 | ポイント |
|---|---|---|
| 被紹介者が無料登録を完了 | 紹介者 | **5pt** |
| 被紹介者が有料プランに加入 | 紹介者 | **15pt** |

- 紹介者は **直上の1人のみ**（`users.referrer_id`）。多階層ツリーの上位へは分配しない
- 有料15ptは **被紹介者1人につき1回**。2つ目のプランを買っても再付与しない
- 合算すると1人の被紹介者あたり最大 20pt

変更したい場合は [lib/points.ts](../lib/points.ts) の `REFERRAL_SIGNUP_POINTS` / `REFERRAL_PURCHASE_POINTS`。
購入ごとに付与する仕様に変えるなら `referralPurchaseEventKey()` を被紹介者IDではなく購入IDで組み立てる。

---

## 2. データモデル

### `point_transactions`（台帳）

付与の履歴を1行1イベントで記録する。**これが正**で、残高はキャッシュ。

| 列 | 用途 |
|---|---|
| `user_id` | 付与先（＝紹介者） |
| `source_user_id` | 起点になった被紹介者 |
| `amount` | 付与ポイント |
| `type` | `referral_signup` / `referral_purchase` |
| `event_key` | **UNIQUE**。二重付与防止の本体 |
| `description` | 表示用の説明 |

### `users.points`

台帳の合計をキャッシュした残高。台帳への挿入と同一トランザクションで増減するため、両者は常に一致する。

### `plans.payment_url`

UnivaPay の決済ページURL。購入画面はこのURLへ利用者を送る。

---

## 3. 二重付与防止

`event_key` は付与イベントごとに一意に決まる文字列。

```
referral_signup:{被紹介者ID}
referral_purchase:{被紹介者ID}
```

`grantPoints()` は挿入前に既存チェックを行い、さらに **DBの UNIQUE 制約**でも弾く。同時リクエストが事前チェックをすり抜けても、一意制約違反（P2002）は「付与済み」として正常扱いする。

台帳への挿入と残高の増減は同一トランザクションなので、片方だけ成功することはない。

> 2026-09-04 に本番で検証済み。同じ遡及付与を2回実行し、2回目は挿入0件・付与0pt・残高不変を確認。

---

## 4. 付与が起きる経路

| 経路 | ファイル |
|---|---|
| 無料登録の完了時 | [app/api/register/route.ts](../app/api/register/route.ts) |
| 決済管理で「決済済にする」 | [app/api/admin/payments/route.ts](../app/api/admin/payments/route.ts) の `PATCH` |
| 購入記録を「決済済」で手動作成 | 同上の `POST` |
| UnivaPay の webhook（`charge_finished`） | [app/api/univapay/webhook/route.ts](../app/api/univapay/webhook/route.ts) |

すべて同じ `event_key` を使うため、**どの経路が先に走っても、複数走っても、付与は1回だけ**。

ポイント付与は `grantPointsSafely()` で囲んであり、**失敗しても登録・決済の本処理は止まらない**。失敗は `[points]` 付きでログに出る。

### 取り消し

決済管理で「未決済に戻す」と、`revokeReferralPurchasePoints()` が台帳の該当行を削除して残高を戻す。「残高＝台帳の合計」を保つための削除であり、再度決済済にすれば改めて付与される。

**その被紹介者に他の支払い済み購入が残っている場合は取り消さない**（`event_key` が購入単位ではなく被紹介者単位のため）。

---

## 5. 決済フロー（URL決済）

UnivaPay は**ホスト型の決済リンク**として使う。このアプリから課金APIは呼ばない。
そのため **App Token / Secret は不要**。

### サイト内から購入する場合

```
/checkout でプラン選択
  → POST /api/checkout/start
      ・「未決済」の purchases レコードを作成
      ・プランの payment_url を返す
  → UnivaPay の決済ページへ遷移
  → 入金確認（webhook または管理画面の手動操作）
      ・status を paid に
      ・紹介者に 15pt
```

決済URL未設定のプランは購入できず、その旨を表示する。

### サイト外で決済URLを送る場合

決済管理の「＋ 購入記録を追加」でユーザーとプランを選んで記録を作る。
入金後に「決済済にする」を押す（または最初から決済済で登録する）。

---

## 6. 管理画面

| 画面 | できること |
|---|---|
| `/admin` | 総ユーザー数・今月の新規・累計/今月の売上・**発行済みポイント**（台帳の合計） |
| `/admin/users` | 一覧、ロール変更、削除、**決済状況**、**ポイント残高** |
| `/admin/plans` | プランの作成・編集・公開/停止・削除、**決済URLの設定** |
| `/admin/payments` | 決済一覧、月別売上グラフ、CSV出力、**決済済↔未決済の切替**、**購入記録の手動追加** |
| `/account` | 自分のパスワード変更（全ユーザー共通） |

購入履歴があるプランは削除できない（決済記録の参照先が消えるため）。「停止」で購入画面から隠す。

### 管理者権限

`role = 'admin'` のユーザーのみ `/admin` に入れる。それ以外は `/partner` へリダイレクト。
未ログインの場合は `/login?next=/admin` へ送られ、認証後 `/admin` に戻る。

管理者が0人のときに限り `POST /api/admin/init` で自分を管理者にできる（1人でも存在すると拒否）。

---

## 7. 環境変数

| 変数 | 必須 | 用途 |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase の Postgres |
| `AUTH_SECRET` | ✅ | next-auth |
| `INVITE_MASTER_CODE` | – | 招待コードなしで登録できるマスターコード（既定 `LWPTNR001`） |
| `UNIVAPAY_WEBHOOK_AUTH_TOKEN` | – | webhook 認証。**未設定なら検証しない** |

`UNIVAPAY_APP_TOKEN` / `UNIVAPAY_APP_SECRET` は**不要**（API課金を使わないため）。

### webhook を有効化する手順

自動反映が必要になったときのみ。**認証トークンは最後に設定すること。**

1. UnivaPay の管理画面で通知先に `https://l-wv1.vercel.app/api/univapay/webhook` を登録
2. テスト決済を通し、`purchases.status` が `paid` になることを確認
3. Vercel のログで実際のリクエストヘッダーを確認
4. ヘッダー名が想定と合っていることを確かめてから `UNIVAPAY_WEBHOOK_AUTH_TOKEN` を設定

> ⚠️ UnivaPay の webhook は HMAC 署名ではなく **共有シークレット（`authToken`）方式**。
> ヘッダー名がSDKに記載されていないため、`Authorization` / `X-Univapay-Auth-Token` /
> `X-Univapay-Authorization` の3つを見ている。**これ以外だった場合、webhook は全て401で弾かれる**。
> 拒否時は `[univapay] webhook rejected:` をログに出す。

---

## 8. DBマイグレーション

DBは **Supabase プロジェクト `luxewave0002`**（`zihodrbmnxdjtppntrnz` / ap-northeast-1）。

適用済みのSQLは [prisma/sql/20260902_add_referral_points.sql](../prisma/sql/20260902_add_referral_points.sql)。

| migration 名 | 内容 |
|---|---|
| `add_referral_points` | `users.points` と `point_transactions` を追加 |
| `add_plan_payment_url` | `plans.payment_url` を追加 |

`point_transactions` は他テーブルと同様 RLS を有効化してある。Prisma はテーブル所有者ロールで接続するため RLS を迂回でき、`anon` からは台帳を読めない。

---

## 9. 遡及付与

過去の紹介にポイントを入れる処理。`/api/admin/points/backfill`（管理者のみ）。

- `GET` … ドライラン。DBは変更しない
- `POST` に `{"dryRun": false}` … 実行

通常の付与と同じ `event_key` を使うので、**何度実行しても結果は変わらない**。

> 2026-09-04 に実行済み。無料登録4件 × 5pt = **20pt** を2名に付与。
> 有料加入分は当時 `paid` の購入が0件だったため0pt。

---

## 10. 注意点・未対応

- **決済コードは実環境で未検証**。UnivaPay の認証情報が無くテストしていない。特に webhook のヘッダー名は要確認（§7）
- **Google認証はユーザーをDBに作らない**。`lib/auth.ts` は PrismaAdapter を使わずJWTセッションのみ。ログインはメール＋パスワードを使うこと
- **紹介ポイントの上位分配は未実装**。必要なら `grantReferralSignupPoints()` / `grantReferralPurchasePoints()` を再帰させる
- **ポイントの利用（消費）機能は無い**。現状は貯まるだけ
- `/api/univapay/charge` は**削除済み**。モックが常に成功を返すため、ログイン済みなら誰でも「支払済」の購入記録を作れてしまう状態だった

---

## 11. デプロイ

`main` へ push すると Vercel が自動デプロイ（`l-wv1` と `l-wv1-toeq` の2プロジェクト）。

デプロイ完了の確認：

```bash
gh api repos/luxewave0002-svg/LWv1/commits/<sha>/status --jq .state
```

> サイトを短間隔で繰り返し取得しないこと。Vercel のボット対策が発動し、
> `x-vercel-mitigated: challenge` で全ページ403になる。
