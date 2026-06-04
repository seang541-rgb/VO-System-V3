-- supabase/seed/10_create_rvt_jobs.sql
-- RVT→IFC conversion job tracking table

BEGIN;

CREATE TABLE IF NOT EXISTS rvt_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  urn             TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','success','failed','downloaded')),
  credits_charged INTEGER NOT NULL DEFAULT 0,
  file_name       TEXT NOT NULL,
  file_size       BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_rvt_jobs_user ON rvt_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_rvt_jobs_status ON rvt_jobs (status);

ALTER TABLE rvt_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_jobs" ON rvt_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_jobs" ON rvt_jobs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_all" ON rvt_jobs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- RPC: deduct N credits (extends existing consume_credit which only does 1)
CREATE OR REPLACE FUNCTION consume_credits(amount INTEGER DEFAULT 1)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
BEGIN
  SELECT credits_balance INTO current_balance
  FROM user_credits
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF current_balance IS NULL OR current_balance < amount THEN
    RAISE EXCEPTION 'NO_CREDITS';
  END IF;

  new_balance := current_balance - amount;

  UPDATE user_credits
  SET credits_balance = new_balance
  WHERE user_id = auth.uid();

  RETURN json_build_object('credits_balance', new_balance);
END;
$$;

-- RPC: refund credits on failed conversion (service_role only)
CREATE OR REPLACE FUNCTION refund_credits(target_user_id UUID, amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_credits
  SET credits_balance = credits_balance + amount
  WHERE user_id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION refund_credits FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refund_credits TO service_role;

COMMIT;
