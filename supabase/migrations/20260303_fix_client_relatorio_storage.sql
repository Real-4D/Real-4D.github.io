-- Fix: storage path uses pedido_id as folder, not user_id
-- Old policy checked: foldername(name)[1] = auth.uid()
-- But files are stored as: {pedido_id}/relatorio.pdf

DROP POLICY IF EXISTS "cliente ver relatorio" ON storage.objects;

CREATE POLICY "cliente ver relatorio" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'relatorios'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.pedidos WHERE email = (auth.jwt() ->> 'email')
  )
);
