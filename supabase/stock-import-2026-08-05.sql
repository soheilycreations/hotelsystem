-- ============================================================================
-- Stock-take import — 05 Aug 2026
-- Transcribed from 4 handwritten stock sheets. Quantities converted to the
-- app's units (kg -> g, L -> ml). unit_cost is set to 0 everywhere — edit
-- each item's cost from the Inventory page (pencil icon) after this runs.
-- reorder_level is also 0 — set real reorder points from the same page.
--
-- ⚠️ A few words were hard to read on the photos — those lines have a
-- "-- verify" comment. Check the item name against the paper before running,
-- and fix the name in this script if needed (or rename after import from
-- the Inventory page).
--
-- Safe to run once. If any of these item names already exist in your
-- inventory, this will create a SECOND row with the same name rather than
-- merging — check the Inventory list after running and delete/merge any
-- duplicates using the Inventory page.
-- ============================================================================

insert into public.inventory_items (name, unit, quantity_in_stock, unit_cost, reorder_level) values

-- ── Sheet 1 — produce, drinks, sundries ──────────────────────────────────
('මාලකොළ',                 'grams', 545,   0, 0), -- verify (curry leaves?)
('අර්තාපල්',                'grams', 395,   0, 0), -- Potato
('ගෝවා',                    'grams', 100,   0, 0), -- verify (cabbage?)
('කැප්සිකම් (මිරි)',        'units', 2,     0, 0), -- verify
('සැකින්',                  'ml',    600,   0, 0), -- verify (word unclear)
('Coca Cola 400ml',         'units', 4,     0, 0),
('Coca Cola 1L',            'units', 1,     0, 0),
('Sprite 400ml',            'units', 7,     0, 0),
('Tonic 400ml',             'units', 12,    0, 0),
('Soda 400ml',              'units', 11,    0, 0),
('Soda 1L',                 'units', 4,     0, 0),
('අඳුරු බෝතල් 1L',          'units', 13,    0, 0), -- verify — "+180" on the sheet unclear, not included
('අඳුරු බෝතල් 500ml',       'units', 10,    0, 0),
('Paper Serviette (pack)',  'units', 9,     0, 0),
('Hand Wash 500ml',         'units', 5,     0, 0),
('Gas cylinder (13kg)',     'units', 13,    0, 0),

-- ── Sheet 2 — baking / dry goods ─────────────────────────────────────────
('කිරිපිටි',                 'grams', 550,   0, 0), -- Milk powder
('Rice Pasta',              'grams', 200,   0, 0),
('මෙළ්',                     'grams', 315,   0, 0), -- verify
('Coconut Powder',          'grams', 100,   0, 0),
('පැපොල් (පපඩම්)',           'grams', 300,   0, 0),
('අවන් කුඩු',                'grams', 1000,  0, 0), -- verify (word unclear)
('තුනපහ කුඩු',               'grams', 190,   0, 0), -- 3-spice mix
('කොත්තමල්ලි පවුඩර්',        'grams', 400,   0, 0), -- Coriander powder
('ලූණු ඇඹ පිටි',             'grams', 494,   0, 0), -- verify
('ගොඩම්බ පිටි',              'grams', 2000,  0, 0), -- verify (wheat flour?)
('චිකන් පවුඩර්',             'grams', 40,    0, 0), -- Chicken stock powder
('ජෙලටින්',                  'grams', 40,    0, 0),
('කඩල',                      'grams', 304,   0, 0), -- Chickpeas/dhal
('අයිසිං සීනි',              'grams', 2000,  0, 0), -- Icing sugar
('කස්ටඩ් පවුඩර්',            'grams', 100,   0, 0),
('කිරි සම්බා (rice)',        'grams', 5000,  0, 0),
('බාස්මති (rice)',           'grams', 2000,  0, 0),
('සීනි',                     'grams', 5300,  0, 0), -- Sugar

-- ── Sheet 3 — spices / sauces ────────────────────────────────────────────
('සුදු ලූණු (packets)',      'units', 3,     0, 0), -- Garlic packets
('මිරිස් කුඩු',              'grams', 200,   0, 0), -- Chili powder
('තුනපහ (500g pack)',       'units', 1,     0, 0),
('කැළි මිරිස්',              'grams', 625,   0, 0), -- verify — Black pepper?
('මිරිස් කුඩු (2)',          'grams', 435,   0, 0), -- verify — 2nd chili powder line
('කුරුඳු',                   'grams', 250,   0, 0), -- verify (Cinnamon?)
('බැරි',                     'grams', 100,   0, 0), -- verify
('තායි ලෙස්ති',              'grams', 40,    0, 0), -- verify (Thai chili paste?)
('මෙයෝනීස්',                'ml',    940,   0, 0), -- Mayonnaise
('Sauce (packets)',         'units', 21,    0, 0),
('නූඩ්ල්ස්',                 'grams', 3750,  0, 0), -- Noodles
('පාන් පිටි',                'grams', 1000,  0, 0), -- Bread flour
('සෝයා සෝස්',                'ml',    7000,  0, 0), -- verify — Soya sauce, qty had a strike-through
('ඔයිස්ටර් සෝස්',            'ml',    5000,  0, 0), -- Oyster sauce
('විනාකිරි',                 'ml',    2500,  0, 0), -- Vinegar
('ගම්මිරිස්',                'grams', 100,   0, 0), -- Pepper
('බිස්කට් කුඩු',             'grams', 350,   0, 0), -- Biscuit crumbs
('කහ කුඩු',                  'grams', 50,    0, 0), -- Turmeric powder
('තෙල්',                     'ml',    4000,  0, 0), -- Cooking oil
('නිල් කෝස්',                'ml',    100,   0, 0), -- verify (food colouring?)
('ස්ටොක් පවුඩර්',            'grams', 100,   0, 0), -- Stock powder

-- ── Sheet 4 — fresh produce, meat, fish ──────────────────────────────────
('මිශ්‍ර එළවළු',             'grams', 2500,  0, 0), -- verify (mixed veg?)
('කොත්තු',                   'grams', 1400,  0, 0), -- verify
('අයිස්ක්‍රීම්',              'ml',    1500,  0, 0), -- Ice cream
('චිකන්',                    'grams', 5000,  0, 0), -- Chicken
('මාළු (තලපත්)',             'grams', 1200,  0, 0), -- Thalapath fish
('ඉස්සෝ',                    'grams', 350,   0, 0), -- Prawns
('උරු මස්',                  'grams', 1200,  0, 0), -- Pork
('බිත්තර',                   'units', 40,    0, 0), -- Eggs
('Tomato Sauce',            'ml',    1500,  0, 0),
('ලීක්ස්',                   'grams', 1300,  0, 0), -- Leeks
('කැරට්',                    'grams', 730,   0, 0), -- Carrot
('කොවි',                     'grams', 150,   0, 0), -- verify
('තක්කාලි',                  'grams', 715,   0, 0), -- Tomato
('නිල් මිදි',                'grams', 2000,  0, 0), -- verify (grapes?)
('ඕකි',                      'grams', 600,   0, 0), -- verify
('ගෝවා (2)',                 'grams', 480,   0, 0), -- 2nd cabbage line
('මෑ මිරිස්',                'grams', 440,   0, 0), -- Big chili/capsicum
('කොළ පිපිඤ්ඤා',             'grams', 920,   0, 0), -- Cucumber
('සුදු ලූණු (loose)',        'grams', 700,   0, 0), -- White onion/garlic, loose
('ඉඟුරු',                    'grams', 100,   0, 0), -- Ginger
('අඹ',                       'grams', 1200,  0, 0); -- Mango
