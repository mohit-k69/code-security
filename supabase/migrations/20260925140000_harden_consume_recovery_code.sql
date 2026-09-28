CREATE OR REPLACE FUNCTION public.consume_recovery_code(
    p_user_id UUID,
    p_code_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated_id UUID;
BEGIN
    UPDATE public.user_recovery_codes
    SET consumed_at = pg_catalog.now()
    WHERE id = (
        SELECT id
        FROM public.user_recovery_codes
        WHERE user_id = p_user_id
          AND code_hash = p_code_hash
          AND consumed_at IS NULL
          AND revoked_at IS NULL
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id INTO v_updated_id;

    RETURN v_updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_recovery_code(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_recovery_code(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_recovery_code(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_recovery_code(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_recovery_code(UUID, TEXT) TO postgres;
