BEGIN;

INSERT INTO cities (id, name, region)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Casablanca', 'Casablanca-Settat'),
  ('10000000-0000-4000-8000-000000000002', 'Rabat', 'Rabat-Salé-Kénitra'),
  ('10000000-0000-4000-8000-000000000003', 'Marrakech', 'Marrakech-Safi'),
  ('10000000-0000-4000-8000-000000000004', 'Tangier', 'Tanger-Tétouan-Al Hoceïma')
ON CONFLICT (name) DO NOTHING;

INSERT INTO profiles (id, full_name, email, role)
VALUES (
  '20000000-0000-4000-8000-000000000001',
  'Chess Morocco Demo Organizer',
  'demo-organizer@chessmorocco.example',
  'organizer'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clubs (id, name, city_id, description, address)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    'Casablanca Chess Club',
    (SELECT id FROM cities WHERE name = 'Casablanca'),
    'A welcoming club for players of all levels, with regular rapid and classical events.',
    'Maarif, Casablanca'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'Rabat Royal Chess Club',
    (SELECT id FROM cities WHERE name = 'Rabat'),
    'Community chess meetups and rated tournaments in Morocco’s capital.',
    'Agdal, Rabat'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'Marrakech Knights Club',
    (SELECT id FROM cities WHERE name = 'Marrakech'),
    'A local chess community hosting friendly blitz nights and open competitions.',
    'Guéliz, Marrakech'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'Tangier Chess Association',
    (SELECT id FROM cities WHERE name = 'Tangier'),
    'A community club bringing players together for chess on the northern coast.',
    'City Centre, Tangier'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO tournaments (
  id, title, description, city_id, club_id, organizer_id,
  start_date, end_date, venue, address, format, time_control,
  max_participants, registration_deadline, entry_fee, prize_fund,
  contact_email, status, featured
)
VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    'Casablanca Autumn Rapid Open',
    'A friendly open rapid tournament for juniors and adults, with prizes for the top finishers.',
    (SELECT id FROM cities WHERE name = 'Casablanca'),
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    CURRENT_DATE + 7, CURRENT_DATE + 7, 'Casablanca Chess Club',
    'Maarif, Casablanca', 'rapid', '15+10', 64, CURRENT_DATE + 5, 50,
    'Trophies and chess books', 'demo-organizer@chessmorocco.example',
    'published', true
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'Rabat Open Swiss',
    'A five-round Swiss tournament open to players of all ratings. Bring your federation ID if available.',
    (SELECT id FROM cities WHERE name = 'Rabat'),
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    CURRENT_DATE + 14, CURRENT_DATE + 15, 'Rabat Royal Chess Club',
    'Agdal, Rabat', 'swiss', '60+30', 48, CURRENT_DATE + 11, 100,
    'Prizes for top three and best junior', 'demo-organizer@chessmorocco.example',
    'published', true
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'Marrakech Blitz Evening',
    'An evening blitz event with a relaxed atmosphere and a short prize ceremony after the final round.',
    (SELECT id FROM cities WHERE name = 'Marrakech'),
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    CURRENT_DATE + 5, CURRENT_DATE + 5, 'Marrakech Knights Club',
    'Guéliz, Marrakech', 'blitz', '3+2', 40, CURRENT_DATE + 3, 30,
    'Club prizes', 'demo-organizer@chessmorocco.example',
    'published', false
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'Tangier Coastal Chess Classic',
    'A two-day classical chess event welcoming competitors from across northern Morocco.',
    (SELECT id FROM cities WHERE name = 'Tangier'),
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    CURRENT_DATE + 21, CURRENT_DATE + 22, 'Tangier Chess Association',
    'City Centre, Tangier', 'classical', '90+30', 40, CURRENT_DATE + 17, 120,
    'Trophies and cash prizes', 'demo-organizer@chessmorocco.example',
    'published', true
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    'Casablanca Junior Chess Cup',
    'A junior-focused rapid event with age-group prizes and a first-tournament-friendly format.',
    (SELECT id FROM cities WHERE name = 'Casablanca'),
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    CURRENT_DATE + 28, CURRENT_DATE + 28, 'Casablanca Chess Club',
    'Maarif, Casablanca', 'rapid', '10+5', 56, CURRENT_DATE + 24, 40,
    'Age-group medals and chess sets', 'demo-organizer@chessmorocco.example',
    'published', false
  ),
  (
    '40000000-0000-4000-8000-000000000006',
    'Rabat Women''s Chess Open',
    'An inclusive open tournament celebrating women in chess, with all playing strengths welcome.',
    (SELECT id FROM cities WHERE name = 'Rabat'),
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    CURRENT_DATE + 35, CURRENT_DATE + 36, 'Rabat Royal Chess Club',
    'Agdal, Rabat', 'swiss', '45+15', 48, CURRENT_DATE + 31, 60,
    'Prizes for top finishers', 'demo-organizer@chessmorocco.example',
    'published', false
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
