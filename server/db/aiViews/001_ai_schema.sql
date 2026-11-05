-- AI analytics — the `ai` schema (AI Amplify).
--
-- Ported from Sama's AI Insights (server/db/aiViews/001_ai_schema.sql on
-- Sama-Vision-Guide@ai-insights-rework). Two rules govern everything below.
--
-- 1. NO DIRECT IDENTIFIERS. No names, emails, phone numbers, bios, company
--    names, avatar URLs, meeting or recording links, LinkedIn URLs, mentor
--    notes, AI Examiner transcripts/feedback/scenarios, quiz answers, billing
--    fields, Stripe ids, certificate numbers or file paths, tokens, password
--    hashes, and nothing from the auth_* tables. A person is pseudonymised
--    down to the platform's own users.id uuid (learner_id / mentor_id) plus
--    category labels — Sama's convention. An administrator can map that id
--    back to a person, so this is pseudonymous data, not anonymous data.
--    server/tests/ai-schema.test.ts enforces this against the live catalogue.
--
-- 2. THE BUSINESS RULES ARE BAKED IN. Who counts as a learner (users.role =
--    'sme'), what "completed" means, how ISO country codes fold into names and
--    which journey a Blended path belongs to are resolved here, in SQL, so a
--    generated query never has to re-derive them.
--
-- Plain VIEWS, not Sama's materialised views: AI Amplify's tables are small enough
-- that every query can read live data, so there is no refresh job and no
-- staleness. Revisit only if a view's plan becomes slow at real volume.
--
-- Apply with:  bun run --filter @workspace/server db:ai-views
-- The server also applies it at boot whenever this file's hash differs from
-- the one stamped on the schema (server/services/ai-sql/apply-on-boot.ts).
-- Re-runnable: every view is dropped and recreated in one transaction.

CREATE SCHEMA IF NOT EXISTS ai;

-- Drop every view in `ai`, including ones this file no longer defines, so a
-- removed view does not linger with stale columns. Views only reference base
-- tables and the helper functions below, never each other.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'ai'
    WHERE c.relkind = 'v'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS ai.%I CASCADE', r.relname);
  END LOOP;
END $$;

/* ------------------------------------------------------------------ */
/* Helper functions                                                    */
/* ------------------------------------------------------------------ */

-- Countries are stored as display names from the `countries-list` package
-- (the sign-up pickers), except early Anna chat sign-ups, which stored the
-- ISO 3166 alpha-2 code ("AE"). Codes, the package's aliases ("UAE", "UK")
-- and any casing of a name all fold to the package's name, so a country is
-- never counted twice. Anything unrecognised is returned trimmed; blank → NULL.
CREATE OR REPLACE FUNCTION ai.country_name(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    (
      SELECT m.name
      FROM (VALUES
      ('AC', 'Ascension Island'), ('AD', 'Andorra'), ('AE', 'United Arab Emirates'), ('AF', 'Afghanistan'),
      ('AG', 'Antigua and Barbuda'), ('AI', 'Anguilla'), ('AL', 'Albania'), ('AM', 'Armenia'),
      ('AO', 'Angola'), ('AQ', 'Antarctica'), ('AR', 'Argentina'), ('AS', 'American Samoa'),
      ('AT', 'Austria'), ('AU', 'Australia'), ('AW', 'Aruba'), ('AX', 'Aland'),
      ('AZ', 'Azerbaijan'), ('BA', 'Bosnia and Herzegovina'), ('BB', 'Barbados'), ('BD', 'Bangladesh'),
      ('BE', 'Belgium'), ('BF', 'Burkina Faso'), ('BG', 'Bulgaria'), ('BH', 'Bahrain'),
      ('BI', 'Burundi'), ('BJ', 'Benin'), ('BL', 'Saint Barthelemy'), ('BM', 'Bermuda'),
      ('BN', 'Brunei'), ('BO', 'Bolivia'), ('BQ', 'Bonaire'), ('BR', 'Brazil'),
      ('BS', 'Bahamas'), ('BT', 'Bhutan'), ('BV', 'Bouvet Island'), ('BW', 'Botswana'),
      ('BY', 'Belarus'), ('BZ', 'Belize'), ('CA', 'Canada'), ('CC', 'Cocos (Keeling) Islands'),
      ('CD', 'Democratic Republic of the Congo'), ('CF', 'Central African Republic'), ('CG', 'Republic of the Congo'), ('CH', 'Switzerland'),
      ('CI', 'Ivory Coast'), ('CK', 'Cook Islands'), ('CL', 'Chile'), ('CM', 'Cameroon'),
      ('CN', 'China'), ('CO', 'Colombia'), ('CR', 'Costa Rica'), ('CU', 'Cuba'),
      ('CV', 'Cabo Verde'), ('CW', 'Curacao'), ('CX', 'Christmas Island'), ('CY', 'Cyprus'),
      ('CZ', 'Czechia'), ('DE', 'Germany'), ('DJ', 'Djibouti'), ('DK', 'Denmark'),
      ('DM', 'Dominica'), ('DO', 'Dominican Republic'), ('DZ', 'Algeria'), ('EC', 'Ecuador'),
      ('EE', 'Estonia'), ('EG', 'Egypt'), ('EH', 'Western Sahara'), ('ER', 'Eritrea'),
      ('ES', 'Spain'), ('ET', 'Ethiopia'), ('FI', 'Finland'), ('FJ', 'Fiji'),
      ('FK', 'Falkland Islands'), ('FM', 'Micronesia'), ('FO', 'Faroe Islands'), ('FR', 'France'),
      ('GA', 'Gabon'), ('GB', 'United Kingdom'), ('GD', 'Grenada'), ('GE', 'Georgia'),
      ('GF', 'French Guiana'), ('GG', 'Guernsey'), ('GH', 'Ghana'), ('GI', 'Gibraltar'),
      ('GL', 'Greenland'), ('GM', 'Gambia'), ('GN', 'Guinea'), ('GP', 'Guadeloupe'),
      ('GQ', 'Equatorial Guinea'), ('GR', 'Greece'), ('GS', 'South Georgia and the South Sandwich Islands'), ('GT', 'Guatemala'),
      ('GU', 'Guam'), ('GW', 'Guinea-Bissau'), ('GY', 'Guyana'), ('HK', 'Hong Kong'),
      ('HM', 'Heard Island and McDonald Islands'), ('HN', 'Honduras'), ('HR', 'Croatia'), ('HT', 'Haiti'),
      ('HU', 'Hungary'), ('ID', 'Indonesia'), ('IE', 'Ireland'), ('IL', 'Israel'),
      ('IM', 'Isle of Man'), ('IN', 'India'), ('IO', 'British Indian Ocean Territory'), ('IQ', 'Iraq'),
      ('IR', 'Iran'), ('IS', 'Iceland'), ('IT', 'Italy'), ('JE', 'Jersey'),
      ('JM', 'Jamaica'), ('JO', 'Jordan'), ('JP', 'Japan'), ('KE', 'Kenya'),
      ('KG', 'Kyrgyzstan'), ('KH', 'Cambodia'), ('KI', 'Kiribati'), ('KM', 'Comoros'),
      ('KN', 'Saint Kitts and Nevis'), ('KP', 'North Korea'), ('KR', 'South Korea'), ('KW', 'Kuwait'),
      ('KY', 'Cayman Islands'), ('KZ', 'Kazakhstan'), ('LA', 'Laos'), ('LB', 'Lebanon'),
      ('LC', 'Saint Lucia'), ('LI', 'Liechtenstein'), ('LK', 'Sri Lanka'), ('LR', 'Liberia'),
      ('LS', 'Lesotho'), ('LT', 'Lithuania'), ('LU', 'Luxembourg'), ('LV', 'Latvia'),
      ('LY', 'Libya'), ('MA', 'Morocco'), ('MC', 'Monaco'), ('MD', 'Moldova'),
      ('ME', 'Montenegro'), ('MF', 'Saint Martin'), ('MG', 'Madagascar'), ('MH', 'Marshall Islands'),
      ('MK', 'North Macedonia'), ('ML', 'Mali'), ('MM', 'Myanmar'), ('MN', 'Mongolia'),
      ('MO', 'Macao'), ('MP', 'Northern Mariana Islands'), ('MQ', 'Martinique'), ('MR', 'Mauritania'),
      ('MS', 'Montserrat'), ('MT', 'Malta'), ('MU', 'Mauritius'), ('MV', 'Maldives'),
      ('MW', 'Malawi'), ('MX', 'Mexico'), ('MY', 'Malaysia'), ('MZ', 'Mozambique'),
      ('NA', 'Namibia'), ('NC', 'New Caledonia'), ('NE', 'Niger'), ('NF', 'Norfolk Island'),
      ('NG', 'Nigeria'), ('NI', 'Nicaragua'), ('NL', 'Netherlands'), ('NO', 'Norway'),
      ('NP', 'Nepal'), ('NR', 'Nauru'), ('NU', 'Niue'), ('NZ', 'New Zealand'),
      ('OM', 'Oman'), ('PA', 'Panama'), ('PE', 'Peru'), ('PF', 'French Polynesia'),
      ('PG', 'Papua New Guinea'), ('PH', 'Philippines'), ('PK', 'Pakistan'), ('PL', 'Poland'),
      ('PM', 'Saint Pierre and Miquelon'), ('PN', 'Pitcairn Islands'), ('PR', 'Puerto Rico'), ('PS', 'Palestine'),
      ('PT', 'Portugal'), ('PW', 'Palau'), ('PY', 'Paraguay'), ('QA', 'Qatar'),
      ('RE', 'Reunion'), ('RO', 'Romania'), ('RS', 'Serbia'), ('RU', 'Russia'),
      ('RW', 'Rwanda'), ('SA', 'Saudi Arabia'), ('SB', 'Solomon Islands'), ('SC', 'Seychelles'),
      ('SD', 'Sudan'), ('SE', 'Sweden'), ('SG', 'Singapore'), ('SH', 'Saint Helena'),
      ('SI', 'Slovenia'), ('SJ', 'Svalbard and Jan Mayen'), ('SK', 'Slovakia'), ('SL', 'Sierra Leone'),
      ('SM', 'San Marino'), ('SN', 'Senegal'), ('SO', 'Somalia'), ('SR', 'Suriname'),
      ('SS', 'South Sudan'), ('ST', 'Sao Tome and Principe'), ('SV', 'El Salvador'), ('SX', 'Sint Maarten'),
      ('SY', 'Syria'), ('SZ', 'Eswatini'), ('TA', 'Tristan da Cunha'), ('TC', 'Turks and Caicos Islands'),
      ('TD', 'Chad'), ('TF', 'French Southern Territories'), ('TG', 'Togo'), ('TH', 'Thailand'),
      ('TJ', 'Tajikistan'), ('TK', 'Tokelau'), ('TL', 'East Timor'), ('TM', 'Turkmenistan'),
      ('TN', 'Tunisia'), ('TO', 'Tonga'), ('TR', 'Türkiye'), ('TT', 'Trinidad and Tobago'),
      ('TV', 'Tuvalu'), ('TW', 'Taiwan'), ('TZ', 'Tanzania'), ('UA', 'Ukraine'),
      ('UG', 'Uganda'), ('UM', 'U.S. Minor Outlying Islands'), ('US', 'United States'), ('UY', 'Uruguay'),
      ('UZ', 'Uzbekistan'), ('VA', 'Vatican City'), ('VC', 'Saint Vincent and the Grenadines'), ('VE', 'Venezuela'),
      ('VG', 'British Virgin Islands'), ('VI', 'U.S. Virgin Islands'), ('VN', 'Vietnam'), ('VU', 'Vanuatu'),
      ('WF', 'Wallis and Futuna'), ('WS', 'Samoa'), ('XK', 'Kosovo'), ('YE', 'Yemen'),
      ('YT', 'Mayotte'), ('ZA', 'South Africa'), ('ZM', 'Zambia'), ('ZW', 'Zimbabwe'),
      ('UAE', 'United Arab Emirates'), ('EMIRATES', 'United Arab Emirates'), ('EAST PAKISTAN', 'Bangladesh'), ('UPPER VOLTA', 'Burkina Faso'),
      ('BAHREIN', 'Bahrain'), ('DAHOMEY', 'Benin'), ('BECHUANALAND', 'Botswana'), ('BYELORUSSIA', 'Belarus'),
      ('BELORUSSIA', 'Belarus'), ('BRITISH HONDURAS', 'Belize'), ('ZAIRE', 'Democratic Republic of the Congo'), ('CONGO-KINSHASA', 'Democratic Republic of the Congo'),
      ('DR CONGO', 'Democratic Republic of the Congo'), ('DRC', 'Democratic Republic of the Congo'), ('UBANGI-SHARI', 'Central African Republic'), ('CONGO-BRAZZAVILLE', 'Republic of the Congo'),
      ('COTE D''IVOIRE', 'Ivory Coast'), ('CAPE VERDE', 'Cabo Verde'), ('CZECH REPUBLIC', 'Czechia'), ('ČESKÁ REPUBLIKA', 'Czechia'),
      ('SPANISH SAHARA', 'Western Sahara'), ('ABYSSINIA', 'Ethiopia'), ('UK', 'United Kingdom'), ('BRITAIN', 'United Kingdom'),
      ('GREAT BRITAIN', 'United Kingdom'), ('GOLD COAST', 'Ghana'), ('PORTUGUESE GUINEA', 'Guinea-Bissau'), ('DUTCH EAST INDIES', 'Indonesia'),
      ('PERSIA', 'Iran'), ('KIRGHIZIA', 'Kyrgyzstan'), ('KYRGYZ REPUBLIC', 'Kyrgyzstan'), ('KAMPUCHEA', 'Cambodia'),
      ('GILBERT ISLANDS', 'Kiribati'), ('DPRK', 'North Korea'), ('REPUBLIC OF KOREA', 'South Korea'), ('LAO PDR', 'Laos'),
      ('CEYLON', 'Sri Lanka'), ('BASUTOLAND', 'Lesotho'), ('MOLDAVIA', 'Moldova'), ('MACEDONIA', 'North Macedonia'),
      ('FYROM', 'North Macedonia'), ('FRENCH SUDAN', 'Mali'), ('BURMA', 'Myanmar'), ('MYANMAR (BURMA)', 'Myanmar'),
      ('MACAU', 'Macao'), ('NYASALAND', 'Malawi'), ('SOUTH WEST AFRICA', 'Namibia'), ('HOLLAND', 'Netherlands'),
      ('RUMANIA', 'Romania'), ('ROUMANIA', 'Romania'), ('RUSSIAN FEDERATION', 'Russia'), ('SYRIAN ARAB REPUBLIC', 'Syria'),
      ('SWAZILAND', 'Eswatini'), ('SIAM', 'Thailand'), ('TURKMENIA', 'Turkmenistan'), ('TURKEY', 'Türkiye'),
      ('TURKIYE', 'Türkiye'), ('ELLICE ISLANDS', 'Tuvalu'), ('FORMOSA', 'Taiwan'), ('TANGANYIKA', 'Tanzania'),
      ('USA', 'United States'), ('AMERICA', 'United States'), ('UNITED STATES OF AMERICA', 'United States'), ('HOLY SEE', 'Vatican City'),
      ('VATICAN', 'Vatican City'), ('VIET NAM', 'Vietnam'), ('NEW HEBRIDES', 'Vanuatu'), ('NORTHERN RHODESIA', 'Zambia'),
      ('RHODESIA', 'Zimbabwe'), ('SOUTHERN RHODESIA', 'Zimbabwe'), ('ASCENSION ISLAND', 'Ascension Island'), ('ANDORRA', 'Andorra'),
      ('UNITED ARAB EMIRATES', 'United Arab Emirates'), ('AFGHANISTAN', 'Afghanistan'), ('ANTIGUA AND BARBUDA', 'Antigua and Barbuda'), ('ANGUILLA', 'Anguilla'),
      ('ALBANIA', 'Albania'), ('ARMENIA', 'Armenia'), ('ANGOLA', 'Angola'), ('ANTARCTICA', 'Antarctica'),
      ('ARGENTINA', 'Argentina'), ('AMERICAN SAMOA', 'American Samoa'), ('AUSTRIA', 'Austria'), ('AUSTRALIA', 'Australia'),
      ('ARUBA', 'Aruba'), ('ALAND', 'Aland'), ('AZERBAIJAN', 'Azerbaijan'), ('BOSNIA AND HERZEGOVINA', 'Bosnia and Herzegovina'),
      ('BARBADOS', 'Barbados'), ('BANGLADESH', 'Bangladesh'), ('BELGIUM', 'Belgium'), ('BURKINA FASO', 'Burkina Faso'),
      ('BULGARIA', 'Bulgaria'), ('BAHRAIN', 'Bahrain'), ('BURUNDI', 'Burundi'), ('BENIN', 'Benin'),
      ('SAINT BARTHELEMY', 'Saint Barthelemy'), ('BERMUDA', 'Bermuda'), ('BRUNEI', 'Brunei'), ('BOLIVIA', 'Bolivia'),
      ('BONAIRE', 'Bonaire'), ('BRAZIL', 'Brazil'), ('BAHAMAS', 'Bahamas'), ('BHUTAN', 'Bhutan'),
      ('BOUVET ISLAND', 'Bouvet Island'), ('BOTSWANA', 'Botswana'), ('BELARUS', 'Belarus'), ('BELIZE', 'Belize'),
      ('CANADA', 'Canada'), ('COCOS (KEELING) ISLANDS', 'Cocos (Keeling) Islands'), ('DEMOCRATIC REPUBLIC OF THE CONGO', 'Democratic Republic of the Congo'), ('CENTRAL AFRICAN REPUBLIC', 'Central African Republic'),
      ('REPUBLIC OF THE CONGO', 'Republic of the Congo'), ('SWITZERLAND', 'Switzerland'), ('IVORY COAST', 'Ivory Coast'), ('COOK ISLANDS', 'Cook Islands'),
      ('CHILE', 'Chile'), ('CAMEROON', 'Cameroon'), ('CHINA', 'China'), ('COLOMBIA', 'Colombia'),
      ('COSTA RICA', 'Costa Rica'), ('CUBA', 'Cuba'), ('CABO VERDE', 'Cabo Verde'), ('CURACAO', 'Curacao'),
      ('CHRISTMAS ISLAND', 'Christmas Island'), ('CYPRUS', 'Cyprus'), ('CZECHIA', 'Czechia'), ('GERMANY', 'Germany'),
      ('DJIBOUTI', 'Djibouti'), ('DENMARK', 'Denmark'), ('DOMINICA', 'Dominica'), ('DOMINICAN REPUBLIC', 'Dominican Republic'),
      ('ALGERIA', 'Algeria'), ('ECUADOR', 'Ecuador'), ('ESTONIA', 'Estonia'), ('EGYPT', 'Egypt'),
      ('WESTERN SAHARA', 'Western Sahara'), ('ERITREA', 'Eritrea'), ('SPAIN', 'Spain'), ('ETHIOPIA', 'Ethiopia'),
      ('FINLAND', 'Finland'), ('FIJI', 'Fiji'), ('FALKLAND ISLANDS', 'Falkland Islands'), ('MICRONESIA', 'Micronesia'),
      ('FAROE ISLANDS', 'Faroe Islands'), ('FRANCE', 'France'), ('GABON', 'Gabon'), ('UNITED KINGDOM', 'United Kingdom'),
      ('GRENADA', 'Grenada'), ('GEORGIA', 'Georgia'), ('FRENCH GUIANA', 'French Guiana'), ('GUERNSEY', 'Guernsey'),
      ('GHANA', 'Ghana'), ('GIBRALTAR', 'Gibraltar'), ('GREENLAND', 'Greenland'), ('GAMBIA', 'Gambia'),
      ('GUINEA', 'Guinea'), ('GUADELOUPE', 'Guadeloupe'), ('EQUATORIAL GUINEA', 'Equatorial Guinea'), ('GREECE', 'Greece'),
      ('SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS', 'South Georgia and the South Sandwich Islands'), ('GUATEMALA', 'Guatemala'), ('GUAM', 'Guam'), ('GUINEA-BISSAU', 'Guinea-Bissau'),
      ('GUYANA', 'Guyana'), ('HONG KONG', 'Hong Kong'), ('HEARD ISLAND AND MCDONALD ISLANDS', 'Heard Island and McDonald Islands'), ('HONDURAS', 'Honduras'),
      ('CROATIA', 'Croatia'), ('HAITI', 'Haiti'), ('HUNGARY', 'Hungary'), ('INDONESIA', 'Indonesia'),
      ('IRELAND', 'Ireland'), ('ISRAEL', 'Israel'), ('ISLE OF MAN', 'Isle of Man'), ('INDIA', 'India'),
      ('BRITISH INDIAN OCEAN TERRITORY', 'British Indian Ocean Territory'), ('IRAQ', 'Iraq'), ('IRAN', 'Iran'), ('ICELAND', 'Iceland'),
      ('ITALY', 'Italy'), ('JERSEY', 'Jersey'), ('JAMAICA', 'Jamaica'), ('JORDAN', 'Jordan'),
      ('JAPAN', 'Japan'), ('KENYA', 'Kenya'), ('KYRGYZSTAN', 'Kyrgyzstan'), ('CAMBODIA', 'Cambodia'),
      ('KIRIBATI', 'Kiribati'), ('COMOROS', 'Comoros'), ('SAINT KITTS AND NEVIS', 'Saint Kitts and Nevis'), ('NORTH KOREA', 'North Korea'),
      ('SOUTH KOREA', 'South Korea'), ('KUWAIT', 'Kuwait'), ('CAYMAN ISLANDS', 'Cayman Islands'), ('KAZAKHSTAN', 'Kazakhstan'),
      ('LAOS', 'Laos'), ('LEBANON', 'Lebanon'), ('SAINT LUCIA', 'Saint Lucia'), ('LIECHTENSTEIN', 'Liechtenstein'),
      ('SRI LANKA', 'Sri Lanka'), ('LIBERIA', 'Liberia'), ('LESOTHO', 'Lesotho'), ('LITHUANIA', 'Lithuania'),
      ('LUXEMBOURG', 'Luxembourg'), ('LATVIA', 'Latvia'), ('LIBYA', 'Libya'), ('MOROCCO', 'Morocco'),
      ('MONACO', 'Monaco'), ('MOLDOVA', 'Moldova'), ('MONTENEGRO', 'Montenegro'), ('SAINT MARTIN', 'Saint Martin'),
      ('MADAGASCAR', 'Madagascar'), ('MARSHALL ISLANDS', 'Marshall Islands'), ('NORTH MACEDONIA', 'North Macedonia'), ('MALI', 'Mali'),
      ('MYANMAR', 'Myanmar'), ('MONGOLIA', 'Mongolia'), ('MACAO', 'Macao'), ('NORTHERN MARIANA ISLANDS', 'Northern Mariana Islands'),
      ('MARTINIQUE', 'Martinique'), ('MAURITANIA', 'Mauritania'), ('MONTSERRAT', 'Montserrat'), ('MALTA', 'Malta'),
      ('MAURITIUS', 'Mauritius'), ('MALDIVES', 'Maldives'), ('MALAWI', 'Malawi'), ('MEXICO', 'Mexico'),
      ('MALAYSIA', 'Malaysia'), ('MOZAMBIQUE', 'Mozambique'), ('NAMIBIA', 'Namibia'), ('NEW CALEDONIA', 'New Caledonia'),
      ('NIGER', 'Niger'), ('NORFOLK ISLAND', 'Norfolk Island'), ('NIGERIA', 'Nigeria'), ('NICARAGUA', 'Nicaragua'),
      ('NETHERLANDS', 'Netherlands'), ('NORWAY', 'Norway'), ('NEPAL', 'Nepal'), ('NAURU', 'Nauru'),
      ('NIUE', 'Niue'), ('NEW ZEALAND', 'New Zealand'), ('OMAN', 'Oman'), ('PANAMA', 'Panama'),
      ('PERU', 'Peru'), ('FRENCH POLYNESIA', 'French Polynesia'), ('PAPUA NEW GUINEA', 'Papua New Guinea'), ('PHILIPPINES', 'Philippines'),
      ('PAKISTAN', 'Pakistan'), ('POLAND', 'Poland'), ('SAINT PIERRE AND MIQUELON', 'Saint Pierre and Miquelon'), ('PITCAIRN ISLANDS', 'Pitcairn Islands'),
      ('PUERTO RICO', 'Puerto Rico'), ('PALESTINE', 'Palestine'), ('PORTUGAL', 'Portugal'), ('PALAU', 'Palau'),
      ('PARAGUAY', 'Paraguay'), ('QATAR', 'Qatar'), ('REUNION', 'Reunion'), ('ROMANIA', 'Romania'),
      ('SERBIA', 'Serbia'), ('RUSSIA', 'Russia'), ('RWANDA', 'Rwanda'), ('SAUDI ARABIA', 'Saudi Arabia'),
      ('SOLOMON ISLANDS', 'Solomon Islands'), ('SEYCHELLES', 'Seychelles'), ('SUDAN', 'Sudan'), ('SWEDEN', 'Sweden'),
      ('SINGAPORE', 'Singapore'), ('SAINT HELENA', 'Saint Helena'), ('SLOVENIA', 'Slovenia'), ('SVALBARD AND JAN MAYEN', 'Svalbard and Jan Mayen'),
      ('SLOVAKIA', 'Slovakia'), ('SIERRA LEONE', 'Sierra Leone'), ('SAN MARINO', 'San Marino'), ('SENEGAL', 'Senegal'),
      ('SOMALIA', 'Somalia'), ('SURINAME', 'Suriname'), ('SOUTH SUDAN', 'South Sudan'), ('SAO TOME AND PRINCIPE', 'Sao Tome and Principe'),
      ('EL SALVADOR', 'El Salvador'), ('SINT MAARTEN', 'Sint Maarten'), ('SYRIA', 'Syria'), ('ESWATINI', 'Eswatini'),
      ('TRISTAN DA CUNHA', 'Tristan da Cunha'), ('TURKS AND CAICOS ISLANDS', 'Turks and Caicos Islands'), ('CHAD', 'Chad'), ('FRENCH SOUTHERN TERRITORIES', 'French Southern Territories'),
      ('TOGO', 'Togo'), ('THAILAND', 'Thailand'), ('TAJIKISTAN', 'Tajikistan'), ('TOKELAU', 'Tokelau'),
      ('EAST TIMOR', 'East Timor'), ('TURKMENISTAN', 'Turkmenistan'), ('TUNISIA', 'Tunisia'), ('TONGA', 'Tonga'),
      ('TÜRKIYE', 'Türkiye'), ('TRINIDAD AND TOBAGO', 'Trinidad and Tobago'), ('TUVALU', 'Tuvalu'), ('TAIWAN', 'Taiwan'),
      ('TANZANIA', 'Tanzania'), ('UKRAINE', 'Ukraine'), ('UGANDA', 'Uganda'), ('U.S. MINOR OUTLYING ISLANDS', 'U.S. Minor Outlying Islands'),
      ('UNITED STATES', 'United States'), ('URUGUAY', 'Uruguay'), ('UZBEKISTAN', 'Uzbekistan'), ('VATICAN CITY', 'Vatican City'),
      ('SAINT VINCENT AND THE GRENADINES', 'Saint Vincent and the Grenadines'), ('VENEZUELA', 'Venezuela'), ('BRITISH VIRGIN ISLANDS', 'British Virgin Islands'), ('U.S. VIRGIN ISLANDS', 'U.S. Virgin Islands'),
      ('VIETNAM', 'Vietnam'), ('VANUATU', 'Vanuatu'), ('WALLIS AND FUTUNA', 'Wallis and Futuna'), ('SAMOA', 'Samoa'),
      ('KOSOVO', 'Kosovo'), ('YEMEN', 'Yemen'), ('MAYOTTE', 'Mayotte'), ('SOUTH AFRICA', 'South Africa'),
      ('ZAMBIA', 'Zambia'), ('ZIMBABWE', 'Zimbabwe')
      ) AS m(k, name)
      WHERE m.k = upper(trim(raw))
    ),
    nullif(trim(raw), '')
  );
$$;

-- live_events.date is free text ('YYYY-MM-DD' by convention). A malformed
-- value becomes NULL instead of failing every query that touches the view.
CREATE OR REPLACE FUNCTION ai.try_date(raw text)
RETURNS date
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF raw IS NULL OR trim(raw) !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;
  RETURN trim(raw)::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Mentor expertise is a free-typed text[] on the application. 'featured' is a
-- display tag (Sessions page "Featured mentors"), not an area of expertise.
CREATE OR REPLACE FUNCTION ai.expertise_list(areas text[])
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(array_to_string(array(
    SELECT trim(x) FROM unnest(areas) AS x
    WHERE trim(x) <> '' AND lower(trim(x)) <> 'featured'
  ), ', '), '');
$$;

/* ------------------------------------------------------------------ */
/* Learners and courses                                                */
/* ------------------------------------------------------------------ */

-- ai.learner — one row per learner (users.role = 'sme'). Mentors and admins
-- never appear in a learner-keyed view.
CREATE VIEW ai.learner AS
SELECT
  u.id                                   AS learner_id,
  ai.country_name(u.country)             AS country,
  u.created_at::date                     AS signed_up_on,
  date_trunc('month', u.created_at)::date AS signup_month,
  u.last_active_at::date                 AS last_active_on,
  u.email_verified                       AS verified,
  (u.invite_code_id IS NOT NULL)         AS signed_up_with_invite,
  u.points                               AS points
FROM users u
WHERE u.role = 'sme';

-- ai.course — one row per course in the library, drafts included.
CREATE VIEW ai.course AS
SELECT
  c.id                     AS course_id,
  c.title                  AS title,
  c.category               AS category,
  c.difficulty::text       AS difficulty,
  c.status::text           AS status,
  c.enable_certificate     AS certificate_enabled,
  c.created_at::date       AS created_on,
  (SELECT count(*)::int FROM modules m WHERE m.course_id = c.id) AS module_count,
  (SELECT count(*)::int FROM units un JOIN modules m ON m.id = un.module_id WHERE m.course_id = c.id) AS unit_count,
  (SELECT count(*)::int
     FROM learning_blocks b
     JOIN units un ON un.id = b.unit_id
     JOIN modules m ON m.id = un.module_id
    WHERE m.course_id = c.id)                                   AS lesson_count
FROM courses c;

-- ai.course_progress — one row per learner per course they enrolled in or
-- started. Enrollment status never moves to 'completed' in the app today;
-- completion is user_course_progress reaching 100%.
CREATE VIEW ai.course_progress AS
SELECT
  coalesce(ce.user_id, p.user_id)                    AS learner_id,
  coalesce(ce.course_id, p.course_id)                AS course_id,
  (ce.id IS NOT NULL)                                AS enrolled,
  ce.status::text                                    AS enrollment_status,
  ce.enrolled_at::date                               AS enrolled_on,
  p.started_at::date                                 AS started_on,
  coalesce(p.progress_percentage, 0)                 AS progress_pct,
  coalesce(p.completed_modules, 0)                   AS completed_modules,
  p.total_modules                                    AS total_modules,
  (p.completed_at IS NOT NULL OR coalesce(p.progress_percentage, 0) >= 100) AS completed,
  p.completed_at::date                               AS completed_on
FROM course_enrollments ce
FULL JOIN user_course_progress p ON p.user_id = ce.user_id AND p.course_id = ce.course_id
JOIN users u ON u.id = coalesce(ce.user_id, p.user_id) AND u.role = 'sme';

-- ai.lesson_progress — one row per learner per AI Amplify lesson (learning block)
-- they have opened or finished, wherever it was done: the course player, a
-- Learning Path, Multi Learning, or an internal item of a Blended path (those
-- are mirrored here).
CREATE VIEW ai.lesson_progress AS
SELECT
  bp.user_id                 AS learner_id,
  bp.learning_block_id       AS lesson_id,
  b.type::text               AS lesson_type,
  b.unit_id                  AS unit_id,
  un.module_id               AS module_id,
  m.course_id                AS course_id,
  bp.status::text            AS status,
  bp.video_watch_pct         AS video_watch_pct,
  bp.completed_at::date      AS completed_on
FROM user_learning_block_progress bp
JOIN users u ON u.id = bp.user_id AND u.role = 'sme'
JOIN learning_blocks b ON b.id = bp.learning_block_id
JOIN units un ON un.id = b.unit_id
JOIN modules m ON m.id = un.module_id;

-- ai.lesson_completion — one row per completed learning step across every
-- stack: AI Amplify lessons (any surface), Content on Demand items and Blended /
-- Blended EXTERNAL items. Internal Blended items are already counted as
-- AI Amplify lessons (the app mirrors them), so they are not repeated here.
CREATE VIEW ai.lesson_completion AS
SELECT
  bp.user_id                 AS learner_id,
  'course_lesson'::text       AS source,
  NULL::uuid                 AS journey_id,
  bp.completed_at::date      AS completed_on
FROM user_learning_block_progress bp
JOIN users u ON u.id = bp.user_id AND u.role = 'sme'
WHERE bp.status = 'completed' AND bp.completed_at IS NOT NULL
UNION ALL
SELECT
  cp.user_id,
  'content_on_demand'::text,
  cp.cod_user_path_id,
  cp.completed_at::date
FROM cod_user_content_progress cp
JOIN users u ON u.id = cp.user_id AND u.role = 'sme'
WHERE cp.status = 'completed' AND cp.completed_at IS NOT NULL
UNION ALL
SELECT
  bi.user_id,
  'blended_learning'::text,
  bi.both_user_path_id,
  bi.completed_at::date
FROM both_user_item_progress bi
JOIN both_user_paths p ON p.id = bi.both_user_path_id
JOIN users u ON u.id = bi.user_id AND u.role = 'sme'
WHERE bi.status = 'completed' AND bi.completed_at IS NOT NULL AND bi.item_type = 'external';

-- ai.course_assessment_attempt — one row per submitted course pre- or
-- post-assessment (the post-assessment is the course's final exam). No answers.
CREATE VIEW ai.course_assessment_attempt AS
SELECT
  aa.id                      AS attempt_id,
  aa.user_id                 AS learner_id,
  a.course_id                AS course_id,
  a.assessment_type::text    AS assessment_type,
  a.is_graded                AS is_graded,
  a.passing_score            AS passing_score,
  aa.attempt_number          AS attempt_number,
  aa.score                   AS score_pct,
  aa.passed                  AS passed,
  aa.completed_at::date      AS completed_on
FROM assessment_attempts aa
JOIN assessments a ON a.id = aa.assessment_id
JOIN users u ON u.id = aa.user_id AND u.role = 'sme'
WHERE aa.completed_at IS NOT NULL;

-- ai.certificate — one row per course certificate issued to a learner. No
-- certificate number, URL or file path.
CREATE VIEW ai.certificate AS
SELECT
  cc.id                      AS certificate_id,
  cc.user_id                 AS learner_id,
  cc.course_id               AS course_id,
  cc.status::text            AS status,
  cc.issued_at::date         AS issued_on
FROM course_certificates cc
JOIN users u ON u.id = cc.user_id AND u.role = 'sme';

/* ------------------------------------------------------------------ */
/* Learning journeys (Learning Path, Content on Demand, Blended)       */
/* ------------------------------------------------------------------ */

-- ai.journey — one row per personalised journey a learner started, across the
-- three AI learning stacks. Regenerating a Learning Path archives the old row
-- and adds a new one, so count DISTINCT learner_id for "learners who started".
CREATE VIEW ai.journey AS
SELECT
  lp.id                      AS journey_id,
  lp.user_id                 AS learner_id,
  'learning_path'::text      AS journey_type,
  lp.status::text            AS status,
  lp.generated_at::date      AS started_on,
  CASE WHEN jsonb_typeof(lp.milestones) = 'array' THEN jsonb_array_length(lp.milestones) ELSE 0 END AS milestone_count
FROM user_learning_path lp
JOIN users u ON u.id = lp.user_id AND u.role = 'sme'
UNION ALL
SELECT
  cp.id,
  cp.user_id,
  'content_on_demand'::text,
  cp.status::text,
  cp.created_at::date,
  CASE WHEN jsonb_typeof(cp.milestones) = 'array' THEN jsonb_array_length(cp.milestones) ELSE 0 END
FROM cod_user_paths cp
JOIN users u ON u.id = cp.user_id AND u.role = 'sme'
UNION ALL
SELECT
  bp.id,
  bp.user_id,
  'blended_learning'::text,
  bp.status::text,
  bp.created_at::date,
  CASE WHEN jsonb_typeof(bp.milestones) = 'array' THEN jsonb_array_length(bp.milestones) ELSE 0 END
FROM both_user_paths bp
JOIN users u ON u.id = bp.user_id AND u.role = 'sme';

-- ai.journey_item_progress — one row per learner per item on a Content on
-- Demand or Blended journey they have opened or finished.
CREATE VIEW ai.journey_item_progress AS
SELECT
  cp.user_id                 AS learner_id,
  cp.cod_user_path_id        AS journey_id,
  'content_on_demand'::text  AS journey_type,
  coalesce(pool.type::text, 'external') AS item_kind,
  cp.status::text            AS status,
  cp.video_watch_pct         AS video_watch_pct,
  cp.completed_at::date      AS completed_on
FROM cod_user_content_progress cp
JOIN users u ON u.id = cp.user_id AND u.role = 'sme'
LEFT JOIN cod_content_pool pool ON pool.id = cp.content_pool_id
UNION ALL
SELECT
  bi.user_id,
  bi.both_user_path_id,
  'blended_learning'::text,
  CASE WHEN bi.item_type = 'internal' THEN 'course_lesson' ELSE coalesce(pool.type::text, 'external') END,
  bi.status::text,
  bi.video_watch_pct,
  bi.completed_at::date
FROM both_user_item_progress bi
JOIN both_user_paths p ON p.id = bi.both_user_path_id
JOIN users u ON u.id = bi.user_id AND u.role = 'sme'
LEFT JOIN both_content_pool pool ON bi.item_type = 'external' AND pool.id = bi.item_id;

-- ai.journey_quiz_result — one row per pretest/posttest a learner submitted
-- on a Content on Demand or Blended milestone. No answers.
CREATE VIEW ai.journey_quiz_result AS
SELECT
  q.user_id                  AS learner_id,
  q.cod_user_path_id         AS journey_id,
  'content_on_demand'::text  AS journey_type,
  q.quiz_type::text          AS quiz_type,
  q.score                    AS questions_correct,
  q.total_questions          AS total_questions,
  CASE WHEN q.total_questions > 0 THEN round(100.0 * q.score / q.total_questions)::int END AS score_pct,
  q.passed                   AS passed,
  q.attempt_number           AS attempt_number,
  q.completed_at::date       AS completed_on
FROM cod_user_quiz_results q
JOIN users u ON u.id = q.user_id AND u.role = 'sme'
UNION ALL
SELECT
  q.user_id,
  q.both_user_path_id,
  'blended_learning'::text,
  q.quiz_type::text,
  q.score,
  q.total_questions,
  CASE WHEN q.total_questions > 0 THEN round(100.0 * q.score / q.total_questions)::int END,
  q.passed,
  q.attempt_number,
  q.completed_at::date
FROM both_user_quiz_results q
JOIN both_user_paths p ON p.id = q.both_user_path_id
JOIN users u ON u.id = q.user_id AND u.role = 'sme';

/* ------------------------------------------------------------------ */
/* Engagement and practice                                             */
/* ------------------------------------------------------------------ */

-- ai.activity_day — one row per learner per day with at least one learning
-- step (the streak table). The day is in the learner's own timezone.
CREATE VIEW ai.activity_day AS
SELECT
  d.user_id                  AS learner_id,
  d.day                      AS active_on,
  d.steps                    AS steps
FROM learner_activity_days d
JOIN users u ON u.id = d.user_id AND u.role = 'sme';

/* ------------------------------------------------------------------ */
/* Mentors                                                             */
/* ------------------------------------------------------------------ */

-- ai.mentor — one row per mentor account (users.role = 'mentor'). No name,
-- email, bio, photo, company, LinkedIn, rate or meeting link. Expertise comes
-- from the mentor's most recent application.
CREATE VIEW ai.mentor AS
SELECT
  u.id                                      AS mentor_id,
  ai.country_name(u.country)                AS country,
  u.created_at::date                        AS joined_on,
  ai.expertise_list(r.expertise)            AS expertise,
  coalesce(EXISTS (SELECT 1 FROM unnest(r.expertise) x WHERE lower(trim(x)) = 'featured'), false) AS featured,
  (SELECT count(*)::int
     FROM mentor_availability_slots s
    WHERE s.mentor_user_id = u.id AND s.is_available AND s.starts_at > now()) AS upcoming_open_slots
FROM users u
LEFT JOIN LATERAL (
  SELECT mr.expertise
  FROM mentor_registrations mr
  WHERE mr.user_id = u.id
  ORDER BY mr.created_at DESC
  LIMIT 1
) r ON true
WHERE u.role = 'mentor';

-- ai.mentor_expertise — one row per mentor per expertise area (long form of
-- ai.mentor.expertise, for grouping). Areas are free-typed on the mentor
-- application, so spellings that differ only in case fold to the most common
-- one ("leadership" -> "Leadership"); the 'featured' display tag is dropped.
CREATE VIEW ai.mentor_expertise AS
WITH raw AS (
  SELECT u.id AS mentor_id, trim(e.area) AS area
  FROM users u
  JOIN mentor_registrations mr ON mr.user_id = u.id
  CROSS JOIN LATERAL unnest(mr.expertise) AS e(area)
  WHERE u.role = 'mentor' AND trim(e.area) <> '' AND lower(trim(e.area)) <> 'featured'
),
canonical AS (
  SELECT DISTINCT ON (lower(area)) lower(area) AS k, area
  FROM raw
  GROUP BY lower(area), area
  ORDER BY lower(area), count(*) DESC, (area = upper(area)), area
)
SELECT DISTINCT
  r.mentor_id                AS mentor_id,
  c.area                     AS expertise
FROM raw r
JOIN canonical c ON c.k = lower(r.area);

-- ai.mentor_application — one row per mentor application. No name, email,
-- LinkedIn, rate or motivation text.
CREATE VIEW ai.mentor_application AS
SELECT
  mr.id                                  AS application_id,
  mr.status                              AS status,
  mr.created_at::date                    AS applied_on,
  ai.expertise_list(mr.expertise)        AS expertise,
  (mr.user_id IS NOT NULL)               AS has_mentor_account
FROM mentor_registrations mr;

-- ai.mentor_session — one row per booked mentoring session. No meeting link
-- and no mentor notes.
CREATE VIEW ai.mentor_session AS
SELECT
  ms.id                                                         AS session_id,
  ms.mentor_user_id                                             AS mentor_id,
  ms.sme_user_id                                                AS learner_id,
  ms.status                                                     AS status,
  ms.booked_at::date                                            AS booked_on,
  s.starts_at                                                   AS starts_at,
  round(extract(epoch FROM (s.ends_at - s.starts_at)) / 60)::int AS duration_minutes,
  ms.cancelled_by                                               AS cancelled_by,
  ms.cancelled_at::date                                         AS cancelled_on,
  ai.expertise_list(r.expertise)                                AS mentor_expertise
FROM mentor_sessions ms
JOIN mentor_availability_slots s ON s.id = ms.slot_id
JOIN users u ON u.id = ms.sme_user_id AND u.role = 'sme'
LEFT JOIN LATERAL (
  SELECT mr.expertise
  FROM mentor_registrations mr
  WHERE mr.user_id = ms.mentor_user_id
  ORDER BY mr.created_at DESC
  LIMIT 1
) r ON true;

/* ------------------------------------------------------------------ */
/* Events, offers, stakeholders                                        */
/* ------------------------------------------------------------------ */

-- ai.live_event — one row per live event, drafts included. No description,
-- meeting link, recording link or cover image.
CREATE VIEW ai.live_event AS
SELECT
  e.id                                              AS event_id,
  e.title                                           AS title,
  e.type                                            AS event_type,
  ai.try_date(e.date)                               AS event_on,
  e.status::text                                    AS status,
  (nullif(trim(e.recording_link), '') IS NOT NULL)  AS has_recording,
  e.created_at::date                                AS created_on
FROM live_events e;

-- ai.offer — one row per partner offer in the marketplace.
CREATE VIEW ai.offer AS
SELECT
  o.id                                  AS offer_id,
  o.title                               AS title,
  o.category                            AS category,
  o.status                              AS status,
  round(o.price / 100.0, 2)             AS price_usd,
  o.points_cost                         AS points_cost,
  (o.price = 0)                         AS is_free,
  o.created_at::date                    AS created_on
FROM offers o;

-- ai.offer_redemption — one row per offer a learner redeemed. No billing
-- name, email, phone, company, country or notes, and no Stripe id.
CREATE VIEW ai.offer_redemption AS
SELECT
  r.id                                  AS redemption_id,
  r.user_id                             AS learner_id,
  r.offer_id                            AS offer_id,
  r.points_deducted                     AS points_spent,
  round(r.amount_charged / 100.0, 2)    AS amount_usd,
  r.order_status                        AS order_status,
  r.redeemed_at::date                   AS redeemed_on
FROM offer_redemptions r
JOIN users u ON u.id = r.user_id AND u.role = 'sme';

-- ai.stakeholder_registration_month — one row per stakeholder type per
-- calendar month with at least one registration. Aggregated on purpose: a
-- stakeholder row is a named person at a named organisation.
CREATE VIEW ai.stakeholder_registration_month AS
SELECT
  s.type                                 AS stakeholder_type,
  date_trunc('month', s.created_at)::date AS registration_month,
  count(*)::int                          AS registrations
FROM stakeholder_registrations s
GROUP BY s.type, date_trunc('month', s.created_at);

/* ------------------------------------------------------------------ */
/* Grants — re-issued so applying this file leaves the read-only role  */
/* able to read every view, whether or not 000_role.sql ran first.     */
/* ------------------------------------------------------------------ */
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'amplify_ai_readonly') THEN
    GRANT USAGE ON SCHEMA ai TO amplify_ai_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA ai TO amplify_ai_readonly;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ai TO amplify_ai_readonly;
  END IF;
END $$;
