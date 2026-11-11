-- CANDIDATO: unificar Boaz + Joaquim sem apagar a antiga sala nem as aulas.
-- NÃO EXECUTAR NO BANCO OFICIAL ANTES DOS TESTES E DA CÓPIA DE SEGURANÇA.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE app_private.eavra_dev_rooms IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE app_private.eavra_dev_class_rooms IN SHARE ROW EXCLUSIVE MODE;

DO $validate$
BEGIN
  IF (SELECT count(*) FROM app_private.eavra_dev_rooms
      WHERE slug IN ('boaz', 'joaquim')) <> 2 THEN
    RAISE EXCEPTION 'rooms_missing_for_safe_merge';
  END IF;

  -- Se duas aulas conflitantes estiverem nas salas antigas ao mesmo tempo,
  -- interrompe a migração: não criar uma reserva duplicada na sala unificada.
  IF EXISTS (
    SELECT 1
    FROM app_private.eavra_dev_class_rooms aj
    JOIN public.classes cj ON cj.id = aj.class_id
    JOIN app_private.eavra_dev_class_rooms ab ON ab.room_slug = 'boaz'
    JOIN public.classes cb ON cb.id = ab.class_id
    WHERE aj.room_slug = 'joaquim'
      AND aj.class_id <> ab.class_id
      AND cj.status <> 'cancelled' AND cb.status <> 'cancelled'
      AND cj.date = cb.date
      AND cj.start_time < cb.end_time
      AND cj.end_time > cb.start_time
  ) THEN
    RAISE EXCEPTION 'room_merge_has_overlapping_reservations';
  END IF;
END $validate$;

-- Preserva os registros de reserva e seus responsáveis originais.
UPDATE app_private.eavra_dev_class_rooms
  SET room_slug = 'boaz'
  WHERE room_slug = 'joaquim';

UPDATE app_private.eavra_dev_rooms
  SET name = 'Sala Boaz Joaquim',
      activities = ARRAY['Instrumentos de cordas']::text[],
      active = true
  WHERE slug = 'boaz';

-- Não apaga a referência histórica de Joaquim: apenas deixa de exibi-la.
UPDATE app_private.eavra_dev_rooms
  SET active = false
  WHERE slug = 'joaquim';

DO $verify$
BEGIN
  IF (SELECT count(*) FROM app_private.eavra_dev_rooms WHERE active) <> 6
  OR NOT EXISTS (SELECT 1 FROM app_private.eavra_dev_rooms
      WHERE slug = 'boaz' AND name = 'Sala Boaz Joaquim' AND active)
  OR EXISTS (SELECT 1 FROM app_private.eavra_dev_class_rooms WHERE room_slug='joaquim')
  THEN RAISE EXCEPTION 'room_merge_verification_failed'; END IF;
END $verify$;
COMMIT;
