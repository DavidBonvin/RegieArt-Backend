-- Data migration: normalise the controlled vocabularies typed by users
-- (roster roles, song genres, suggested instruments) to French.
-- Free-text content (event titles, organisation names, descriptions) is left untouched.

-- ─── Roster roles ───
UPDATE "event_roster" er
SET "role" = m.fr
FROM (VALUES
    ('Músico',              'Musicien'),
    ('Musico',              'Musicien'),
    ('Cantante',            'Chanteur'),
    ('Corista',             'Choriste'),
    ('Guitarrista',         'Guitariste'),
    ('Bajista',             'Bassiste'),
    ('Pianista',            'Pianiste'),
    ('Tecladista',          'Clavier'),
    ('Baterista',           'Batteur'),
    ('Percusionista',       'Percussionniste'),
    ('Trompetista',         'Trompettiste'),
    ('Saxofonista',         'Saxophoniste'),
    ('Violinista',          'Violoniste'),
    ('Director Musical',    'Directeur musical'),
    ('Director musical',    'Directeur musical'),
    ('Técnico',             'Technicien'),
    ('Tecnico',             'Technicien'),
    ('Técnico FOH',         'Technicien FOH'),
    ('Técnico de sonido',   'Technicien son'),
    ('Ingeniero de sonido', 'Ingénieur du son'),
    ('Iluminador',          'Éclairagiste'),
    ('Road manager',        'Régisseur'),
    ('Manager',             'Manager'),
    ('Invitado',            'Invité'),
    ('Otro',                'Autre')
  ) AS m(es, fr)
WHERE er."role" = m.es;

-- ─── Song genres ───
UPDATE "songs" s
SET "genre" = m.fr
FROM (VALUES
    ('Otro',            'Autre'),
    ('Otros',           'Autre'),
    ('Clásico',         'Classique'),
    ('Clasico',         'Classique'),
    ('Música clásica',  'Musique classique'),
    ('Popular',         'Populaire'),
    ('Folclórico',      'Folklorique'),
    ('Folklórico',      'Folklorique'),
    ('Tradicional',     'Traditionnel'),
    ('Religioso',       'Religieux'),
    ('Banda sonora',    'Bande originale'),
    ('Balada',          'Ballade'),
    ('Electrónica',     'Électronique'),
    ('Infantil',        'Jeune public')
  ) AS m(es, fr)
WHERE s."genre" = m.es;

-- ─── Suggested instrument on invitations ───
UPDATE "invitations" i
SET "instrument" = m.fr
FROM (VALUES
    ('Voz',                'Chant'),
    ('Guitarra',           'Guitare'),
    ('Guitarra eléctrica', 'Guitare électrique'),
    ('Guitarra acústica',  'Guitare acoustique'),
    ('Bajo',               'Basse'),
    ('Batería',            'Batterie'),
    ('Percusión',          'Percussions'),
    ('Teclado',            'Clavier'),
    ('Trompeta',           'Trompette'),
    ('Trombón',            'Trombone'),
    ('Saxofón',            'Saxophone'),
    ('Flauta',             'Flûte'),
    ('Violín',             'Violon'),
    ('Violonchelo',        'Violoncelle'),
    ('Contrabajo',         'Contrebasse'),
    ('Acordeón',           'Accordéon'),
    ('Sonido',             'Son'),
    ('Iluminación',        'Éclairage')
  ) AS m(es, fr)
WHERE i."instrument" = m.es;
