-- Admin precisa de SELECT e DELETE no bucket relatorios para upsert funcionar
CREATE POLICY "admin select relatorios storage"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'relatorios' AND (auth.jwt() ->> 'email') = 'contato@real4d.me');

CREATE POLICY "admin delete relatorios storage"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'relatorios' AND (auth.jwt() ->> 'email') = 'contato@real4d.me');
