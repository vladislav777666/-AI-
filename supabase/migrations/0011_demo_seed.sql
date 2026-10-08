-- 0011_demo_seed.sql
-- Полный тестовый набор для защиты (PDF §8):
--   4 участка · 25 единиц оборудования · 20 шифров неисправностей ·
--   40 позиций материалов · 15 исполнителей в 3 бригадах · 520 нарядов за 3 месяца.
--
-- В историю нарядов ЗАЛОЖЕНЫ 4 закономерности, которые должен находить ИИ
-- (§6.5 «Аномалии» и §6.6 «Рейтинг»):
--   1) «Конвейер К-3» ломается ~3 раза чаще остального оборудования;
--   2) один исполнитель (Ахметов Е.С.) получает повторные отказы;
--   3) внеплановая поломка вскоре после планового ремонта (ППР → «хвост»);
--   4) списание ТМЦ в 3 раза выше материального норматива.
--
-- Миграция идемпотентна: пересоздаёт демо-данные с нуля.
-- Профили и аккаунты (auth.users / public.profiles) НЕ трогаются —
-- затрагиваются только справочники, сотрудники и наряды.

begin;

-- ============================================================
-- 0. Чистка демо-данных (порядок важен из-за внешних ключей).
--    Аккаунты и профили сохраняются.
-- ============================================================
delete from public.work_order_history;
delete from public.work_order_acceptance;
delete from public.notifications;
delete from public.work_orders;
delete from public.materials;
delete from public.equipment;
delete from public.workers;
delete from public.areas;

-- Читаемые ФИО тестовых аккаунтов (созданы через Admin API).
update public.profiles p
   set full_name = v.name
  from (values
    ('master@naryad.app',  'Смагулов Ерлан Бекович'),
    ('master2@naryad.app', 'Каримов Дамир Аскарович'),
    ('head@naryad.app',    'Абдрахманов Серик Маратович'),
    ('admin@naryad.app',   'Волкова Ольга Сергеевна'),
    ('worker@naryad.app',  'Типо Исполнитель')
  ) as v(email, name)
 where lower(p.email) = v.email;

-- ============================================================
-- 1. Участки — 4 шт.
-- ============================================================
insert into public.areas (name) values
  ('Дробление'),
  ('Обогащение'),
  ('Ремонтно-механический цех'),
  ('Энергетический участок');

-- ============================================================
-- 2. Оборудование — 25 единиц с атрибутами PDF §8.
-- ============================================================
insert into public.equipment (area_id, name, inventory_no, equipment_type, criticality)
select a.id, v.name, v.inv, v.etype, v.crit
from (values
  ('Дробление', 'Дробилка КМД-1750', 'INV-0101', 'Дробильная техника', 'Высокая'),
  ('Дробление', 'Грохот вибрационный ГИС-1230', 'INV-0102', 'Грохоты', 'Высокая'),
  ('Дробление', 'Конвейер К-3', 'INV-0103', 'Конвейеры', 'Высокая'),
  ('Дробление', 'Конвейер К-7', 'INV-0104', 'Конвейеры', 'Средняя'),
  ('Дробление', 'Питатель вибрационный ПВ-90', 'INV-0105', 'Питатели', 'Средняя'),
  ('Дробление', 'Сито грохот СГ-150', 'INV-0106', 'Грохоты', 'Низкая'),
  ('Обогащение', 'Флотомашина ФМ-10', 'INV-0201', 'Флотомашины', 'Средняя'),
  ('Обогащение', 'Сепаратор С-4М', 'INV-0202', 'Сепараторы', 'Средняя'),
  ('Обогащение', 'Насос ИЦ-100-50', 'INV-0203', 'Насосы', 'Высокая'),
  ('Обогащение', 'Конвейер К-12', 'INV-0204', 'Конвейеры', 'Средняя'),
  ('Обогащение', 'Мельница МШЦ-3200', 'INV-0205', 'Мельницы', 'Высокая'),
  ('Обогащение', 'Гидроциклон ГЦ-500', 'INV-0206', 'Гидроциклоны', 'Низкая'),
  ('Ремонтно-механический цех', 'Станок ЧПУ-1', 'INV-0301', 'Металлорежущие станки', 'Средняя'),
  ('Ремонтно-механический цех', 'Станок токарный 16К20', 'INV-0302', 'Металлорежущие станки', 'Средняя'),
  ('Ремонтно-механический цех', 'Станок фрезерный 6М82Г', 'INV-0303', 'Металлорежущие станки', 'Средняя'),
  ('Ремонтно-механический цех', 'Пресс гидравлический 1600 кН', 'INV-0304', 'Прессы', 'Высокая'),
  ('Ремонтно-механический цех', 'Компрессор ВП-2', 'INV-0305', 'Компрессоры', 'Высокая'),
  ('Ремонтно-механический цех', 'Сварочный трансформатор ВД-306', 'INV-0306', 'Сварочное оборудование', 'Низкая'),
  ('Ремонтно-механический цех', 'Кран-балка 3,2 т', 'INV-0307', 'Грузоподъёмное', 'Высокая'),
  ('Энергетический участок', 'Трансформатор ТМ-1000', 'INV-0401', 'Электрооборудование', 'Высокая'),
  ('Энергетический участок', 'Распределительный щит ЩС-0,4', 'INV-0402', 'Электрооборудование', 'Средняя'),
  ('Энергетический участок', 'Насос центробежный НЦ-65', 'INV-0403', 'Насосы', 'Средняя'),
  ('Энергетический участок', 'Вентилятор ВЦ-14', 'INV-0404', 'Вентиляция', 'Низкая'),
  ('Энергетический участок', 'Генератор ДГ-100', 'INV-0405', 'Электрооборудование', 'Высокая'),
  ('Энергетический участок', 'Компрессор КС-18', 'INV-0406', 'Компрессоры', 'Средняя')
) as v(area, name, inv, etype, crit)
join public.areas a on a.name = v.area;

-- ============================================================
-- 3. Шифры неисправностей — 20 шт. (15 из 0003 обновляем, 5 новых).
--    complexity 1..5 и material_norm_qty нужны панели руководителя.
-- ============================================================
update public.fault_codes f
   set name = v.name,
       description = v.descr,
       norm_hours = v.norm_h,
       material_norm = v.mat,
       work_type = v.wtype,
       complexity = v.cplx,
       material_norm_qty = v.norm_qty,
       sort_order = v.sort,
       active = true
  from (values
    ('М-01', 'Механика: износ подшипника', 'Замена/ремонт подшипниковых узлов', 4, 'Подшипник, съёмник, смазка', 'unplanned', 3, 4, 10),
    ('М-02', 'Механика: люфт вала', 'Устранение люфтов и перекосов валов', 6, 'Шайбы, прокладки, крепёж', 'unplanned', 3, 3, 20),
    ('М-03', 'Механика: вибрация', 'Балансировка, крепёж, демпфирование', 3, 'Демпферы, крепёж', 'unplanned', 2, 2, 30),
    ('М-04', 'Механика: деформация корпуса', 'Трещины, сколы, правка корпусных деталей', 8, 'Сварочные электроды, шпаклёвка', 'unplanned', 5, 6, 40),
    ('М-05', 'Механика: биение вала', 'Центровка, замена муфт, динамическая балансировка', 5, 'Муфты, крепёж', 'unplanned', 4, 3, 160),
    ('Э-01', 'Электрика: обрыв цепи', 'Поиск и устранение обрывов', 2, 'Провод, клеммы, изолента', 'unplanned', 1, 3, 50),
    ('Э-02', 'Электрика: КЗ/замыкание', 'Изоляция, замена проводки', 3, 'Кабель, изоляция, предохранители', 'unplanned', 3, 5, 60),
    ('Э-03', 'Электрика: двигатель', 'Ремонт/замена электродвигателя', 6, 'Двигатель, муфта, крепёж', 'unplanned', 5, 4, 70),
    ('Э-04', 'Электрика: датчики/АСУ', 'Неисправности датчиков и автоматики', 4, 'Датчик, кабельный ввод', 'unplanned', 2, 2, 80),
    ('Э-05', 'Электрика: пускатель/контактор', 'Замена пускателя, зачистка контактов', 2, 'Пускатель, провод', 'unplanned', 2, 2, 170),
    ('Г-01', 'Гидравлика: утечка', 'Течь по соединениям и уплотнениям', 2, 'Уплотнения, шланг', 'unplanned', 2, 2, 90),
    ('Г-02', 'Гидравлика: насос', 'Ремонт/замена насосного узла', 5, 'Насос, фильтр, масло', 'unplanned', 4, 5, 100),
    ('Г-03', 'Гидравлика: давление', 'Настройка редукторов, клапанов', 3, 'Манометр, пружина редуктора', 'unplanned', 2, 2, 110),
    ('Г-04', 'Гидравлика: утечка масла из бака', 'Замена уплотнений, промывка контура', 4, 'Уплотнения, масло', 'unplanned', 3, 4, 180),
    ('П-01', 'Пневматика: утечка воздуха', 'Течь пневмосоединений', 2, 'Фитинги, лента ФУМ', 'unplanned', 1, 2, 120),
    ('П-02', 'Пневматика: клапан/цилиндр', 'Замена пневмоэлементов', 4, 'Клапан, цилиндр, уплотнения', 'unplanned', 3, 3, 130),
    ('П-03', 'Пневматика: износ клапана ресивера', 'Замена клапанной группы', 3, 'Клапан, прокладки', 'unplanned', 3, 2, 190),
    ('С-01', 'Смазка: недостаток смазки', 'Восстановление подачи смазки', 1, 'Смазка, шприц', 'planned', 1, 2, 140),
    ('С-02', 'Смазка: загрязнение масла', 'Замена масла, промывка', 2, 'Масло, фильтр, промывка', 'planned', 2, 3, 150),
    ('С-03', 'Смазка: засорение системы ЦС', 'Промывка магистрали, замена фильтров', 2, 'Смазка, фильтры', 'planned', 2, 3, 200)
  ) as v(code, name, descr, norm_h, mat, wtype, cplx, norm_qty, sort)
 where f.code = v.code;

insert into public.fault_codes (code, name, description, sort_order, norm_hours, material_norm, work_type, complexity, material_norm_qty) values
  ('М-05', 'Механика: биение вала', 'Центровка, замена муфт, динамическая балансировка', 160, 5, 'Муфты, крепёж', 'unplanned', 4, 3),
  ('Э-05', 'Электрика: пускатель/контактор', 'Замена пускателя, зачистка контактов', 170, 2, 'Пускатель, провод', 'unplanned', 2, 2),
  ('Г-04', 'Гидравлика: утечка масла из бака', 'Замена уплотнений, промывка контура', 180, 4, 'Уплотнения, масло', 'unplanned', 3, 4),
  ('П-03', 'Пневматика: износ клапана ресивера', 'Замена клапанной группы', 190, 3, 'Клапан, прокладки', 'unplanned', 3, 2),
  ('С-03', 'Смазка: засорение системы ЦС', 'Промывка магистрали, замена фильтров', 200, 2, 'Смазка, фильтры', 'planned', 2, 3)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  norm_hours = excluded.norm_hours,
  material_norm = excluded.material_norm,
  work_type = excluded.work_type,
  complexity = excluded.complexity,
  material_norm_qty = excluded.material_norm_qty,
  active = true;

-- ============================================================
-- 4. Материалы и запчасти — 40 позиций (ТЗ §2.2).
-- ============================================================
insert into public.materials (name, qty, unit, area_id)
select v.name, v.qty, v.unit, a.id
from (values
  ('Подшипник 6205', 24, 'шт', 'Дробление'),
  ('Подшипник 6206', 18, 'шт', 'Дробление'),
  ('Подшипник 36208', 10, 'шт', 'Обогащение'),
  ('Масло индустриальное И-ГМ-40', 60, 'л', 'Обогащение'),
  ('Масло гидравлическое И-Г-46', 45, 'л', 'Ремонтно-механический цех'),
  ('Кабель ПВС 3×1.5', 120, 'м', 'Энергетический участок'),
  ('Кабель ВВГ 3×2.5', 200, 'м', 'Энергетический участок'),
  ('Провод ПВ-3 2,5', 150, 'м', 'Энергетический участок'),
  ('Пневмоцилиндр SC32×100', 6, 'шт', 'Ремонтно-механический цех'),
  ('Клапан пневматический 5/2', 8, 'шт', 'Ремонтно-механический цех'),
  ('Шланг гидравлический DN16', 30, 'м', 'Ремонтно-механический цех'),
  ('Ремень клиновой B-2000', 12, 'шт', 'Дробление'),
  ('Цепь приводная 24B-1', 6, 'м', 'Дробление'),
  ('Ролик конвейерный 108', 40, 'шт', 'Дробление'),
  ('Батарея сетевая 4К-9НК', 14, 'шт', 'Энергетический участок'),
  ('Пускатель ПМ-12', 10, 'шт', 'Энергетический участок'),
  ('Автомат ВА47-29', 25, 'шт', 'Энергетический участок'),
  ('Смазка литиевая ЛИТОЛ-24', 35, 'кг', 'Ремонтно-механический цех'),
  ('Смазка пластичная CI-2', 20, 'кг', 'Обогащение'),
  ('Фильтр гидравлический Г750', 9, 'шт', 'Ремонтно-механический цех'),
  ('Фильтр масляный МФ-1', 11, 'шт', 'Ремонтно-механический цех'),
  ('Уплотнение манжета 35×52×7', 30, 'шт', 'Обогащение'),
  ('Прокладка паронитовая', 50, 'шт', 'Обогащение'),
  ('Лента ФУМ', 25, 'рул', 'Ремонтно-механический цех'),
  ('Изолента ПВХ', 40, 'рул', 'Энергетический участок'),
  ('Электрод Р3-3.2', 60, 'кг', 'Ремонтно-механический цех'),
  ('Проволока Св-08Г2С', 25, 'кг', 'Ремонтно-механический цех'),
  ('Шпаклёвка реактивная', 15, 'кг', 'Ремонтно-механический цех'),
  ('Болт М12×40', 300, 'шт', 'Дробление'),
  ('Гайка М12', 300, 'шт', 'Дробление'),
  ('Шайба Гровера М12', 300, 'шт', 'Дробление'),
  ('Крепёж анкерный М16', 80, 'шт', 'Ремонтно-механический цех'),
  ('Датчик температуры ТС-104', 7, 'шт', 'Энергетический участок'),
  ('Датчик давления ДМ-05', 6, 'шт', 'Энергетический участок'),
  ('Прокладка пробковая', 45, 'шт', 'Обогащение'),
  ('Насосная группа НГ-32', 3, 'шт', 'Обогащение'),
  ('Муфта зубчатая М-3', 8, 'шт', 'Дробление'),
  ('Мотор-редуктор 1:23', 4, 'шт', 'Дробление'),
  ('Фитинги латунные 1/2″', 50, 'шт', 'Ремонтно-механический цех'),
  ('Термоусадка 3×1', 20, 'м', 'Энергетический участок')
) as v(name, qty, unit, area)
left join public.areas a on a.name = v.area;

-- ============================================================
-- 5. Сотрудники — 15 исполнителей в 3 бригадах (ТЗ §2.4).
--    Первый (Типо Исполнитель) связан с тестовым аккаунтом
--    worker@naryad.app, чтобы вход «Исполнитель» показывал его наряды.
-- ============================================================
insert into public.workers (user_id, full_name, specialty, rank, brigade, area_id, status, rating)
select
  case when v.link then (select id from auth.users where email = 'worker@naryad.app') end,
  v.name, v.spec, v.rank, v.brigade, a.id, v.status, v.rating
from (values
  ('Типо Исполнитель', 'Слесарь', '4 разряд', 'Бригада №1', 'Дробление', 'free', 4.6, true),
  ('Иванов И.И.', 'Электрик', '5 разряд', 'Бригада №2', 'Дробление', 'busy', 4.2, false),
  ('Петров П.П.', 'Механик', '3 разряд', 'Бригада №3', 'Обогащение', 'not_on_shift', 3.9, false),
  ('Сидоров С.С.', 'Сварщик', '5 разряд', 'Бригада №1', 'Ремонтно-механический цех', 'free', 4.8, false),
  ('Ким А.В.', 'Оператор дробильной установки', '4 разряд', 'Бригада №1', 'Дробление', 'queue', 4.1, false),
  ('Ахметов Е.С.', 'Слесарь по ремонту машин', '4 разряд', 'Бригада №2', 'Обогащение', 'free', 3.6, false),
  ('Оспанов О.О.', 'Электромонтёр', '4 разряд', 'Бригада №3', 'Энергетический участок', 'busy', 4.4, false),
  ('Мельников М.М.', 'Слесарь-сантехник', '3 разряд', 'Бригада №2', 'Обогащение', 'free', 4.0, false),
  ('Гаврилов Г.Г.', 'Механик', '5 разряд', 'Бригада №1', 'Ремонтно-механический цех', 'queue', 4.7, false),
  ('Нурланов Н.Н.', 'Оператор сепараторов', '3 разряд', 'Бригада №3', 'Обогащение', 'free', 3.8, false),
  ('Фёдоров Ф.Ф.', 'Электрик', '4 разряд', 'Бригада №2', 'Энергетический участок', 'not_on_shift', 4.3, false),
  ('Тлеуов Т.Т.', 'Стропальщик', '3 разряд', 'Бригада №1', 'Ремонтно-механический цех', 'free', 4.5, false),
  ('Захаров З.З.', 'Слесарь КИПиА', '4 разряд', 'Бригада №3', 'Энергетический участок', 'busy', 4.2, false),
  ('Саинов С.С.', 'Оператор мельницы', '4 разряд', 'Бригада №2', 'Обогащение', 'free', 3.7, false),
  ('Дьяченко Д.Д.', 'Слесарь-ремонтник', '5 разряд', 'Бригада №1', 'Дробление', 'queue', 4.9, false)
) as v(name, spec, rank, brigade, area, status, rating, link)
left join public.areas a on a.name = v.area;

-- ============================================================
-- 6. Наряды — 520 шт. за 3 месяца + приёмки.
--    Закономерности 1–4 заложены детерминированно (см. шапку файла).
--    Бульварная таблица набирается в _seed и переносится одним INSERT;
--    хронология создаётся триггером 0003.
-- ============================================================
create temporary table _seed (
  num text, eq uuid, worker uuid, wtype text, code text, status text,
  created_at timestamptz, deadline timestamptz, react numeric, work numeric,
  close_days int, priority text, mat_name text, mat_qty numeric, mat_unit text,
  reject_reason text
) on commit drop;

do $seed$
declare
  v_eq        uuid[];
  v_others    uuid[];
  v_conveyor  uuid;
  v_workers   uuid[];
  v_rejecter  uuid;
  v_unpl      text[];
  v_pln       text[];
  v_master    uuid;
  v_n_eq      int;
  v_n_oth     int;
  v_n_w       int;
  v_n_unpl    int;
  v_n_pln     int;
  v_total     int := 520;
  v_num       int := 0;
  v_pend_eq   uuid;
  v_pend_days int;
  i           int;
  r           record;
  v_idx       int;
  v_u         int := 0;
  v_days      int;
  v_created   timestamptz;
  v_deadline  timestamptz;
  v_is_unpl   boolean;
  v_eq_id     uuid;
  v_code      text;
  v_react     numeric;
  v_work      numeric;
  v_prio      text;
  v_dl_days   int;
  v_close     int;
  v_mat_name  text;
  v_mat_qty   numeric;
  v_mat_unit  text;
  v_f         record;
  v_st        text;
begin
  select array_agg(e.id order by e.inventory_no) into v_eq from public.equipment e;
  select e.id into v_conveyor from public.equipment e where e.name = 'Конвейер К-3';
  if v_conveyor is null then v_conveyor := v_eq[1]; end if;
  select array_agg(x.id) into v_others
    from (select e.id from public.equipment e where e.id <> v_conveyor order by e.inventory_no) x;
  select array_agg(w.id order by w.full_name) into v_workers from public.workers w;
  select w.id into v_rejecter from public.workers w where w.full_name = 'Ахметов Е.С.';
  if v_rejecter is null then v_rejecter := v_workers[least(6, array_length(v_workers, 1))]; end if;
  select array_agg(f.code order by f.sort_order) into v_unpl
    from public.fault_codes f where coalesce(f.work_type, 'unplanned') <> 'planned';
  select array_agg(f.code order by f.sort_order) into v_pln
    from public.fault_codes f where f.work_type = 'planned';
  select id into v_master from auth.users where email = 'master@naryad.app';

  v_n_eq   := coalesce(array_length(v_eq, 1), 1);
  v_n_oth  := coalesce(array_length(v_others, 1), 1);
  v_n_w    := coalesce(array_length(v_workers, 1), 1);
  v_n_unpl := coalesce(array_length(v_unpl, 1), 1);
  v_n_pln  := coalesce(array_length(v_pln, 1), 1);

  -- ---------- 6.1 Недавние активные наряды (доска мастера §6.1) ----------
  v_idx := 0;
  for r in
    select * from (values
      ('issued'::text, 2::int, 1::int), ('issued', 3, 1), ('issued', 1, 3), ('issued', 4, 3),
      ('issued', 1, 2), ('issued', 5, 4),
      ('accepted', 3, 2), ('accepted', 2, 1), ('accepted', 1, 4),
      ('queued', 2, 3), ('queued', 4, 5), ('queued', 3, 4), ('queued', 5, 6),
      ('suspended', 3, 4), ('suspended', 5, 6),
      ('completed', 2, 3), ('completed', 3, 4), ('completed', 4, 6),
      ('rework', 3, 2), ('rework', 4, 5), ('rework', 5, 7)
    ) as t(st, d, dl)
  loop
    v_idx := v_idx + 1;
    v_num := v_num + 1;
    v_st := r.st;
    v_is_unpl := (v_idx - 1) % 3 <> 0;
    v_eq_id := v_eq[((v_idx - 1) * 7) % v_n_eq + 1];
    v_created := date_trunc('day', now()) - make_interval(days => r.d) + interval '8 hours';
    v_deadline := date_trunc('day', now()) - make_interval(days => r.d - r.dl) + interval '18 hours';
    insert into _seed values (
      'Н-' || to_char(v_created, 'YYMMDD') || '-' || lpad(v_num::text, 4, '0'),
      v_eq_id, v_workers[(v_idx - 1) % v_n_w + 1],
      case when v_is_unpl then 'unplanned' else 'planned' end,
      case when v_is_unpl then v_unpl[(v_idx - 1) % v_n_unpl + 1] else v_pln[(v_idx - 1) % v_n_pln + 1] end,
      v_st, v_created, v_deadline,
      case when v_st = 'issued' then null else 1 + ((v_idx - 1) % 3) end,
      case when v_st in ('completed', 'rework') then 2 + ((v_idx - 1) % 4) else null end,
      0,
      case when v_is_unpl then 'normal' else 'planned' end,
      null, null, null, null
    );
  end loop;

  -- ---------- 6.2 Основная масса: 520 нарядов за ~3 месяца ----------
  for i in 0 .. v_total - 1 loop
    v_days := 3 + floor(i * 85.0 / greatest(1, v_total))::int;
    v_created := date_trunc('day', now()) - make_interval(days => v_days) + interval '8 hours';
    v_num := v_num + 1;
    v_mat_name := null; v_mat_qty := null; v_mat_unit := null;

    -- (1) плановый ремонт …
    if i % 14 = 0 and v_total - i > 2 then
      -- (i * 5) % 25 при i, кратном 14, даёт всего 5 разных единиц —
      -- берём порядковый номер ППР, чтобы оборудование распределялось ровно.
      v_eq_id := v_eq[(i / 14) % v_n_eq + 1];
      v_deadline := date_trunc('day', now()) - make_interval(days => v_days - 3) + interval '18 hours';
      insert into _seed values (
        'Н-' || to_char(v_created, 'YYMMDD') || '-' || lpad(v_num::text, 4, '0'),
        v_eq_id, v_workers[(i * 3) % v_n_w + 1], 'planned', v_pln[i % v_n_pln + 1], 'closed',
        v_created, v_deadline, 1, 2, 0, 'planned', null, null, null, null
      );
      v_pend_eq := v_eq_id;
      v_pend_days := v_days;
      continue;
    end if;

    -- (2) …затем внеплановая поломка того же узла вскоре после ППР.
    if v_pend_eq is not null then
      v_days := greatest(1, v_pend_days - 2);
      v_created := date_trunc('day', now()) - make_interval(days => v_days) + interval '8 hours';
      v_deadline := date_trunc('day', now()) - make_interval(days => v_days - 1) + interval '18 hours';
      insert into _seed values (
        'Н-' || to_char(v_created, 'YYMMDD') || '-' || lpad(v_num::text, 4, '0'),
        v_pend_eq, v_workers[i % v_n_w + 1], 'unplanned', v_unpl[i % v_n_unpl + 1], 'closed',
        v_created, v_deadline, 2, 3, 0, 'normal', null, null, null, null
      );
      v_pend_eq := null;
      continue;
    end if;

    -- (3) повторные отказы одного исполнителя (компонент §6.6).
    if i % 11 = 5 then
      v_deadline := date_trunc('day', now()) - make_interval(days => v_days - 1) + interval '18 hours';
      insert into _seed values (
        'Н-' || to_char(v_created, 'YYMMDD') || '-' || lpad(v_num::text, 4, '0'),
        v_others[i % v_n_oth + 1], v_rejecter, 'unplanned', v_unpl[i % v_n_unpl + 1], 'rejected',
        v_created, v_deadline, null, null, 0, 'normal', null, null, null,
        (array['Нет материалов', 'Нет допуска', 'Занят аварийным обслуживанием', null]::text[])[i % 4 + 1]
      );
      continue;
    end if;

    -- (4) основная масса; конвейер — «проблемный узел» (~3× чаще остальных).
    --     Счётчик v_u ведётся ТОЛЬКО по внеплановым нарядам: условие
    --     «i % 9 = 0» недостижимо внутри этой ветки (i % 3 <> 0), поэтому
    --     долю задаём отдельным счётчиком, а не номером итерации.
    v_is_unpl := i % 3 <> 0;
    if v_is_unpl then
      v_u := v_u + 1;
      if v_u % 5 = 0 then
        v_eq_id := v_conveyor;
      else
        v_eq_id := v_others[(i * 7) % v_n_oth + 1];
      end if;
    else
      v_eq_id := v_eq[(i * 11) % v_n_eq + 1];
    end if;
    v_code := case when v_is_unpl then v_unpl[i % v_n_unpl + 1] else v_pln[i % v_n_pln + 1] end;
    v_react := case when v_is_unpl then 1 + (i % 5) else 1 end;
    v_work := 2 + (i % 6);
    v_dl_days := case when v_is_unpl then 1 else 3 end;
    v_close := case when i % 5 = 0 then 1 else 0 end;
    v_prio := case when v_is_unpl
      then (array['normal', 'normal', 'high', 'emergency', 'normal', 'high']::text[])[i % 6 + 1]
      else 'planned' end;
    v_deadline := date_trunc('day', now()) - make_interval(days => v_days - v_dl_days) + interval '18 hours';

    -- (5) аномальный расход: в 3 раза выше материального норматива (§6.5).
    select f.material_norm_qty, split_part(coalesce(f.material_norm, 'Материалы'), ',', 1)
      into v_mat_qty, v_mat_name
      from public.fault_codes f where f.code = v_code;
    if v_is_unpl and i % 13 = 4 and v_mat_qty is not null then
      v_mat_qty := v_mat_qty * 3;
      v_mat_unit := 'шт';
    else
      v_mat_name := null; v_mat_qty := null; v_mat_unit := null;
    end if;

    insert into _seed values (
      'Н-' || to_char(v_created, 'YYMMDD') || '-' || lpad(v_num::text, 4, '0'),
      v_eq_id, v_workers[(i * 7) % v_n_w + 1],
      case when v_is_unpl then 'unplanned' else 'planned' end,
      v_code, 'closed', v_created, v_deadline, v_react, v_work, v_close, v_prio,
      v_mat_name, v_mat_qty, v_mat_unit, null
    );
  end loop;

  -- ---------- 6.2b Отменённые наряды ----------
  -- Нужны, чтобы коэффициент надёжности K = C/(C+X+U+0,5·J) (см. src/lib/analytics.ts)
  -- различал исполнителей: у кого потерь больше, у того K ниже. Распределены
  -- неравномерно — часть исполнителей не отменяла ничего (K = 1.00), часть — до 8 нарядов.
  for i in 0 .. 29 loop
    v_days := 5 + (i * 3) % 80;
    v_created := date_trunc('day', now()) - make_interval(days => v_days) + interval '8 hours';
    v_num := v_num + 1;
    insert into _seed values (
      'Н-' || to_char(v_created, 'YYMMDD') || '-' || lpad(v_num::text, 4, '0'),
      v_eq[(i * 13) % v_n_eq + 1],
      v_workers[(i * i) % v_n_w + 1],
      'unplanned', v_unpl[i % v_n_unpl + 1], 'cancelled',
      v_created,
      date_trunc('day', now()) - make_interval(days => v_days - 1) + interval '18 hours',
      null, null, 0, 'normal', null, null, null,
      'Оборудование выведено в резерв, работы не требуются'
    );
  end loop;

  -- ---------- 6.3 Перенос в рабочие таблицы ----------
  insert into public.work_orders (
    number, work_type, description, area_id, equipment_id, worker_id,
    deadline, priority, status, fault_code, norm_hours, work_done,
    materials, materials_list, pause_reason, reject_reason, created_by,
    created_at, accepted_at, started_at, completed_at, closed_at
  )
  select
    t.num,
    t.wtype,
    f.name || '. ' || f.description,
    e.area_id,
    t.eq,
    t.worker,
    t.deadline,
    t.priority,
    t.status,
    t.code,
    f.norm_hours,
    case when t.work is not null then 'Выполнено: ' || lower(f.name) end,
    case when t.mat_name is not null then t.mat_name || ' × ' || trim(to_char(t.mat_qty, 'FM999999')) || ' ' || t.mat_unit end,
    case when t.mat_name is not null then
      jsonb_build_array(jsonb_build_object('name', t.mat_name, 'qty', t.mat_qty, 'unit', t.mat_unit))
    else '[]'::jsonb end,
    case when t.status = 'suspended' then 'Ждёт запчасти' end,
    t.reject_reason,
    v_master,
    t.created_at,
    case when t.react is not null then t.created_at + make_interval(hours => t.react::int) end,
    case when t.react is not null then t.created_at + make_interval(hours => t.react::int) end,
    case when t.work is not null and t.react is not null
      then t.created_at + make_interval(hours => (t.react + t.work)::int) end,
    case when t.work is not null and t.react is not null and t.status = 'closed'
      then t.created_at + make_interval(hours => (t.react + t.work)::int) + make_interval(days => t.close_days) end
  from _seed t
  join public.fault_codes f on f.code = t.code
  join public.equipment e on e.id = t.eq;

  -- ---------- 6.4 Приёмки по закрытым/завершённым/на доработку ----------
  insert into public.work_order_acceptance (
    order_id, ai_score, ai_comment, master_decision, agreed_with_ai, decided_by, created_at
  )
  select
    o.id,
    3 + ((row_number() over (order by o.created_at) * 5) % 3),
    'Оценка ИИ: работа выполнена, замечаний нет. Пройдено критериев: ' ||
      (3 + ((row_number() over (order by o.created_at) * 5) % 3)) || '/5.',
    case when o.status = 'rework' then 'rework' else 'accepted' end,
    true,
    v_master,
    coalesce(o.closed_at, o.completed_at, o.created_at)
  from public.work_orders o
  where o.status in ('closed', 'completed', 'rework');

  -- ---------- 6.5 Хронология: дописываем приёмку к закрытым нарядам ----------
  insert into public.work_order_history (order_id, actor_id, actor_name, action, changes, event_type, created_at)
  select a.order_id, v_master, 'Смагулов Ерлан Бекович', 'Приёмка работ',
         jsonb_build_array(jsonb_build_object('field', 'Решение', 'from', null, 'to', a.master_decision)),
         'ACCEPTANCE', a.created_at
  from public.work_order_acceptance a
  where not exists (
    select 1 from public.work_order_history h
    where h.order_id = a.order_id and h.event_type = 'ACCEPTANCE'
  );
end
$seed$;

commit;

-- ============================================================
-- После применения:
--   участков — 4, оборудования — 25, шифров — 20, материалов — 40,
--   исполнителей — 15 (3 бригады), нарядов — 541 (21 активный + 520 за 3 мес.).
-- Заложенные закономерности проверяются в веб-панели руководителя:
--   «Аномалии и аналитика» → проблемное оборудование (Конвейер К-3 ×3),
--     ППР → внеплановый «хвост», аномальный расход материалов;
--   «Рейтинг» → повторные отказы (Ахметов Е.С.), сложность и K.
-- ============================================================
