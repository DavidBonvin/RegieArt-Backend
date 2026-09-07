-- Roster roles were snapshotted into notification bodies before the vocabulary
-- normalisation, so translate them there too.
UPDATE "notifications" n
SET "body" = 'Votre rôle : ' || m.fr
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
    ('Invitado',            'Invité'),
    ('Otro',                'Autre')
  ) AS m(es, fr)
WHERE n."body" = 'Votre rôle : ' || m.es;
