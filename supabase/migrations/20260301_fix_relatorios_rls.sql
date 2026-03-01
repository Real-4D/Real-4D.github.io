-- 1. Add UNIQUE constraint on pedido_id (required for upsert onConflict)
ALTER TABLE public.relatorios ADD CONSTRAINT relatorios_pedido_id_key UNIQUE (pedido_id);

-- 2. Add explicit INSERT policy for admin on relatorios
--    (the ALL policy may not properly apply WITH CHECK for INSERT)
CREATE POLICY "admin insert relatorios"
ON public.relatorios FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() ->> 'email') = 'contato@real4d.me');

-- 3. Add explicit UPDATE policy for admin on relatorios
CREATE POLICY "admin update relatorios"
ON public.relatorios FOR UPDATE TO authenticated
USING ((auth.jwt() ->> 'email') = 'contato@real4d.me')
WITH CHECK ((auth.jwt() ->> 'email') = 'contato@real4d.me');

-- 4. Add explicit UPDATE policy for admin on pedidos
--    (needed to set status to 'analise_concluida')
CREATE POLICY "admin update pedidos"
ON public.pedidos FOR UPDATE TO authenticated
USING ((auth.jwt() ->> 'email') = 'contato@real4d.me')
WITH CHECK ((auth.jwt() ->> 'email') = 'contato@real4d.me');
