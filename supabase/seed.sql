-- Free pack used by every mode. Premium packs arrive in Phase 5.
insert into packs (slug, name, mode_scope, price_minor, currency, is_free, active)
values ('free', 'Free Game', array['couple', 'friends', 'circle'], 0, 'PHP', true, true)
on conflict (slug) do nothing;
