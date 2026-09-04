-- 紹介ポイント機能のためのスキーマ追加
--   users.points        : ポイント残高のキャッシュ
--   point_transactions  : 付与の台帳。event_key の UNIQUE が二重付与防止の本体
--
-- 適用方法（どちらか）:
--   1) psql "$DATABASE_URL" -f prisma/sql/20260902_add_referral_points.sql
--   2) npm run db:push   （schema.prisma から同じ形が作られる）

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "points" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "point_transactions" (
    "id"             TEXT NOT NULL,
    "user_id"        TEXT NOT NULL,
    "source_user_id" TEXT,
    "amount"         INTEGER NOT NULL,
    "type"           TEXT NOT NULL,
    "event_key"      TEXT NOT NULL,
    "description"    TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "point_transactions_event_key_key"
    ON "point_transactions" ("event_key");
CREATE INDEX IF NOT EXISTS "point_transactions_user_id_idx"
    ON "point_transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "point_transactions_source_user_id_idx"
    ON "point_transactions" ("source_user_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'point_transactions_user_id_fkey'
    ) THEN
        ALTER TABLE "point_transactions"
            ADD CONSTRAINT "point_transactions_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'point_transactions_source_user_id_fkey'
    ) THEN
        ALTER TABLE "point_transactions"
            ADD CONSTRAINT "point_transactions_source_user_id_fkey"
            FOREIGN KEY ("source_user_id") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
