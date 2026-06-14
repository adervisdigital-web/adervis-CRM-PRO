    (() => {
      "use strict";

      const APP_VERSION = "4.2";
      const STORAGE_KEY = "adervis_pro_381_state";
      const THEME_KEY = "adervis_pro_theme";
      const LAST_AGENCY_KEY = "adervis_last_agency_id";

      const CAT = {
        creative: "💡 Креатив",
        pre: "🧠 Подготовка",
        shoot: "🎥 Съёмка",
        photo: "📸 Фото",
        equipment: "🧰 Техника",
        post: "✂️ Постпродакшн",
        sound: "🎙 Звук",
        animation: "✨ Графика / анимация",
        marketing: "📣 Маркетинг",
        management: "🗂 Менеджмент",
        logistics: "🚚 Логистика",
        ai: "🤖 ИИ / Нейросети",
        event: "🎪 Мероприятия",
        custom: "➕ Свои позиции"
      };

      const EXPENSE_CATEGORIES = [
        "Техника и оборудование",
        "Подписки и ПО",
        "ИИ / Нейросети",
        "Команда",
        "Локация и студия",
        "Транспорт и логистика",
        "Питание",
        "Реквизит и расходники",
        "Музыка и лицензии",
        "Реклама и продвижение",
        "Прочее"
      ];

      const TAX_OPTIONS = [
        { id: "none", label: "Без налога", rate: 0 },
        { id: "tax5", label: "5%", rate: 0.05 },
        { id: "tax6", label: "6%", rate: 0.06 },
        { id: "vat7", label: "7%", rate: 0.07 },
        { id: "tax10", label: "10%", rate: 0.10 },
        { id: "tax12", label: "12%", rate: 0.12 },
        { id: "tax15", label: "15%", rate: 0.15 },
        { id: "tax18", label: "18%", rate: 0.18 },
        { id: "vat20", label: "НДС 20%", rate: 0.20 },
        { id: "usn6", label: "УСН 6%", rate: 0.06 },
        { id: "usn15", label: "УСН 15%", rate: 0.15 }
      ];

      const CRM_STATUSES = ["Лид", "Бриф", "КП отправлено", "Согласование", "Договор", "Предоплата", "В работе", "Сдано", "Закрыто"];
      const TASK_STATUSES = ["Новая", "В работе", "На согласовании", "Готово"];
      const PRIORITIES = ["Низкий", "Средний", "Высокий", "Срочно"];

      const DEFAULT_STAGES = [
        { id: "pre", name: "Подготовка", color: "#8b5cf6", desc: "Идея, сценарий, планирование, подбор." },
        { id: "shoot", name: "Съёмка", color: "#2563eb", desc: "Команда, техника, площадка и съёмочный процесс." },
        { id: "post", name: "Постпродакшн", color: "#16a34a", desc: "Монтаж, цвет, звук, графика, версии." },
        { id: "management", name: "Управление", color: "#ea580c", desc: "Продюсирование, менеджмент, координация." },
        { id: "marketing", name: "Маркетинг", color: "#0891b2", desc: "Адаптации, публикации, упаковка контента." }
      ];

      function item(id, category, name, desc, calcModel, price, unit, extra = {}) {
        return {
          id,
          category,
          section: CAT[category] || category,
          name,
          desc,
          calcModel,
          price,
          unit,
          stage: extra.stage || "pre",
          tags: extra.tags || [],
          rates: extra.rates || {},
          ...extra
        };
      }

      const BASE_ITEMS = [
        item("idea", "creative", "Идея ролика", "Базовая идея, направление подачи, простая концепция.", "creativeWork", 4000, "пакет", { tags: ["идея", "концепция"] }),
        item("concept", "creative", "Концепция кампании", "Расширенная концепция, логика роликов, смысловая рамка.", "creativeWork", 7000, "пакет", { tags: ["концепция", "кампания"] }),
        item("script_short", "creative", "Сценарий короткого ролика", "Сценарий для ролика до 60 секунд.", "creativeWork", 5000, "сценарий", { tags: ["сценарий"] }),
        item("script_full", "creative", "Сценарий ролика 1–3 минуты", "Структура, текст, сцены, базовые реплики.", "creativeWork", 8000, "сценарий", { tags: ["сценарий"] }),
        item("storyboard", "pre", "Раскадровка простая", "Кадровый план без сложной иллюстрации.", "creativeWork", 6000, "пакет", { tags: ["раскадровка"] }),
        item("shoot_plan", "pre", "План съёмки", "Съёмочный план, тайминг, список сцен.", "fixed", 3500, "пакет", { tags: ["план", "тайминг"] }),
        item("interview_questions", "pre", "Вопросы для интервью", "Подготовка структуры интервью и списка вопросов.", "creativeWork", 3500, "пакет", { tags: ["интервью"] }),
        item("content_day_plan", "pre", "План контент-дня", "Планирование съёмочного дня для серии коротких роликов.", "creativeWork", 6000, "пакет", { tags: ["контент-день", "reels"] }),

        item("director", "shoot", "Режиссёр", "Постановка и контроль творческого результата на съёмке.", "crewShift", 9000, "смена", {
          stage: "shoot", rates: { hour: 1500, half: 6000, full: 9000, long: 12000, premium: 16000, overtimeHour: 1200 }, tags: ["режиссер"]
        }),
        item("dop", "shoot", "Оператор-постановщик", "Кадр, световая логика, визуальное решение.", "crewShift", 9000, "смена", {
          stage: "shoot", rates: { hour: 1500, half: 6000, full: 9000, long: 12000, premium: 16000, overtimeHour: 1200 }, tags: ["оператор"]
        }),
        item("camera_operator", "shoot", "Оператор", "Съёмка на камеру, работа по ТЗ.", "crewShift", 6000, "смена", {
          stage: "shoot", rates: { hour: 1000, half: 4000, full: 6000, long: 8000, premium: 11000, overtimeHour: 800 }, tags: ["оператор"]
        }),
        item("second_camera_operator", "shoot", "Второй оператор", "Дополнительная камера для интервью, мероприятия или динамичной сцены.", "crewShift", 5500, "смена", {
          stage: "shoot", rates: { hour: 900, half: 3600, full: 5500, long: 7500, premium: 10500, overtimeHour: 750 }, tags: ["второй оператор"]
        }),
        item("assistant", "shoot", "Ассистент на площадке", "Помощь на съёмке, перенос, подготовка, мелкие задачи.", "crewShift", 2500, "смена", {
          stage: "shoot", rates: { hour: 450, half: 1700, full: 2500, long: 3500, premium: 5000, overtimeHour: 350 }, tags: ["ассистент"]
        }),
        item("gaffer", "shoot", "Гафер / свет", "Базовая постановка света на небольшой площадке.", "crewShift", 6000, "смена", {
          stage: "shoot", rates: { hour: 1000, half: 4000, full: 6000, long: 8500, premium: 12000, overtimeHour: 850 }, tags: ["свет"]
        }),
        item("soundman", "sound", "Звукорежиссёр на съёмке", "Запись чистого звука на площадке.", "crewShift", 5000, "смена", {
          stage: "shoot", rates: { hour: 850, half: 3500, full: 5000, long: 7000, premium: 10000, overtimeHour: 700 }, tags: ["звук"]
        }),
        item("producer", "management", "Продюсер проекта", "Организация, контроль, коммуникация с командой.", "perDay", 5000, "день", { stage: "management", tags: ["продюсер"] }),
        item("pm", "management", "Проектный менеджер", "Ведение проекта, сроки, задачи, клиентские согласования.", "perDay", 3500, "день", { stage: "management", tags: ["менеджер"] }),
        item("admin", "management", "Администратор съёмки", "Организация бытовых вопросов на площадке.", "crewShift", 3000, "смена", {
          stage: "management", rates: { hour: 550, half: 2000, full: 3000, long: 4500, premium: 6500, overtimeHour: 450 }, tags: ["администратор"]
        }),

        item("camera_basic", "equipment", "Камера базовая", "Базовый комплект камеры для простой съёмки.", "equipmentRental", 4000, "день", { stage: "shoot", rates: { day: 4000 }, tags: ["камера"] }),
        item("camera_pro", "equipment", "Камера продвинутая", "Камера выше базового уровня для рекламных задач.", "equipmentRental", 7000, "день", { stage: "shoot", rates: { day: 7000 }, tags: ["камера"] }),
        item("lens_set", "equipment", "Комплект оптики", "Базовый набор объективов.", "equipmentRental", 3000, "день", { stage: "shoot", rates: { day: 3000 }, tags: ["оптика"] }),
        item("light_basic", "equipment", "Свет базовый", "Небольшой комплект света для интервью / простой сцены.", "equipmentRental", 2500, "день", { stage: "shoot", rates: { day: 2500 }, tags: ["свет"] }),
        item("light_plus", "equipment", "Свет расширенный", "Комплект света для более сложной сцены.", "equipmentRental", 5000, "день", { stage: "shoot", rates: { day: 5000 }, tags: ["свет"] }),
        item("sound_kit", "equipment", "Комплект звука", "Рекордер, петлички / направленный микрофон.", "equipmentRental", 2000, "день", { stage: "shoot", rates: { day: 2000 }, tags: ["звук"] }),
        item("stabilizer", "equipment", "Стабилизатор", "Электронный стабилизатор для динамичных кадров.", "equipmentRental", 1500, "день", { stage: "shoot", rates: { day: 1500 }, tags: ["стабилизатор"] }),
        item("drone", "equipment", "Дрон", "Простая аэросъёмка при подходящих условиях.", "equipmentRental", 4000, "день", { stage: "shoot", rates: { day: 4000 }, tags: ["дрон"] }),

        item("photographer", "photo", "Фотограф", "Фотосъёмка мероприятия, команды или объекта.", "crewShift", 5000, "смена", {
          stage: "shoot", rates: { hour: 850, half: 3500, full: 5000, long: 7000, premium: 10000, overtimeHour: 700 }, tags: ["фото"]
        }),
        item("photo_retouch", "photo", "Базовая ретушь фото", "Лёгкая цветокоррекция и базовая обработка.", "fixed+qty", 150, "фото", { stage: "post", tags: ["ретушь"] }),

        item("edit", "post", "Монтаж ролика", "Гибкий расчёт монтажа по длительности, сложности, версиям и срочности.", "videoEdit", 6000, "ролик", {
          stage: "post", rates: { base: 6000, perMinute: 2500, extraVersion: 1800, extraRevision: 1200, sourcePack: 1000 }, tags: ["монтаж"]
        }),
        item("edit_short", "post", "Монтаж короткого Reels / Shorts", "Монтаж вертикального короткого ролика.", "videoEdit", 3000, "ролик", {
          stage: "post", rates: { base: 3000, perMinute: 1800, extraVersion: 900, extraRevision: 700, sourcePack: 700 }, tags: ["reels", "shorts"]
        }),
        item("color", "post", "Цветокоррекция", "Базовая цветокоррекция ролика.", "fixed", 3500, "ролик", { stage: "post", tags: ["цвет"] }),
        item("sound_post", "sound", "Чистка и сведение звука", "Улучшение речи, базовое сведение, громкость.", "fixed", 3000, "ролик", { stage: "post", tags: ["звук"] }),
        item("music", "sound", "Подбор музыки", "Подбор трека из доступных библиотек.", "fixed", 1500, "пакет", { stage: "post", tags: ["музыка"] }),
        item("voiceover_text", "creative", "Текст диктора", "Написание текста для озвучки ролика.", "creativeWork", 4500, "текст", { tags: ["диктор"] }),
        item("voiceover_record", "sound", "Запись диктора", "Базовая запись дикторского голоса.", "fixed", 5000, "ролик", { stage: "post", tags: ["диктор"] }),
        item("subtitles", "post", "Субтитры", "Субтитры для короткого ролика.", "fixed", 1500, "ролик", { stage: "post", tags: ["субтитры"] }),
        item("vertical_adapt", "post", "Адаптация в вертикальный формат", "Версия 9:16 для Reels / Shorts / VK Клипы.", "fixed+qty", 1500, "версия", { stage: "post", tags: ["адаптация"] }),
        item("titles", "animation", "Титры / простая графика", "Имена, подписи, простые плашки.", "fixed", 2500, "ролик", { stage: "post", tags: ["титры"] }),
        item("motion_basic", "animation", "Простая motion-графика", "Несложная анимация элементов.", "fixed", 6000, "пакет", { stage: "post", tags: ["motion"] }),
        item("logo_anim", "animation", "Анимация логотипа простая", "Короткая простая анимация логотипа.", "fixed", 4000, "ролик", { stage: "post", tags: ["логотип"] }),
        item("logo_anim_pro", "animation", "Анимация логотипа профи", "Сложная анимация с частицами, 3D или кинетическими эффектами.", "fixed", 9000, "ролик", { stage: "post", tags: ["логотип", "профи"] }),
        item("intro_outro", "animation", "Интро / Аутро для канала", "Фирменное видео-интро и аутро для YouTube или стримов.", "fixed", 5500, "пакет", { stage: "post", tags: ["интро", "аутро", "канал"] }),
        item("social_template", "animation", "Шаблоны для соцсетей", "Набор анимированных шаблонов для Stories и постов.", "fixed+qty", 3000, "пакет", { stage: "marketing", tags: ["шаблоны", "соцсети"] }),
        item("kinetic_typography", "animation", "Кинетическая типографика", "Анимация текста и цитат в стиле кинетической типографики.", "fixed", 7500, "ролик", { stage: "post", tags: ["типографика", "текст"] }),
        item("motion_infographic", "animation", "Анимированная инфографика", "Инфографика с анимацией: диаграммы, схемы, цифры.", "fixed+qty", 8000, "слайд", { stage: "post", tags: ["инфографика", "данные"] }),
        item("transition_pack", "animation", "Пакет переходов / эффектов", "Кастомные переходы, маски и VFX-вставки для монтажа.", "fixed", 4500, "пакет", { stage: "post", tags: ["переходы", "VFX"] }),
        item("screen_recording_edit", "animation", "Обработка скринкастов", "Редактура, монтаж и оформление записей экрана: зум, подсветка кликов, субтитры.", "fixed", 3500, "ролик", { stage: "post", tags: ["скринкаст", "туториал"] }),
        item("3d_elements", "animation", "3D-элементы и рендер", "Простые 3D-объекты и рендер для вставки в видео или графику.", "fixed", 15000, "пакет", { stage: "post", tags: ["3D", "рендер"] }),
        item("motion_ui", "animation", "Анимация интерфейса / UI", "Анимация экранов приложения или веб-интерфейса для промо-видео.", "fixed", 9000, "проект", { stage: "post", tags: ["UI", "анимация", "приложение"] }),

        item("landing_video_pack", "marketing", "Пакет видео для сайта", "Подготовка ролика и коротких нарезок для сайта.", "fixed", 6000, "пакет", { stage: "marketing", tags: ["сайт"] }),
        item("smm_cutdowns", "marketing", "Нарезки для соцсетей", "Короткие нарезки из основного материала.", "fixed+qty", 1200, "ролик", { stage: "marketing", tags: ["smm"] }),
        item("cover_design", "marketing", "Обложка / превью", "Простая обложка для видео.", "fixed+qty", 800, "шт", { stage: "marketing", tags: ["обложка"] }),
        item("thumbnail_pack", "marketing", "Пакет обложек", "Серия обложек для видео, VK, YouTube или коротких роликов.", "fixed+qty", 900, "обложка", { stage: "marketing", tags: ["обложки"] }),
        item("publication_support", "marketing", "Помощь с публикацией", "Подготовка файла, описания, обложки и базовая публикация.", "fixed", 2500, "публикация", { stage: "marketing", tags: ["публикация"] }),
        item("copywriting", "marketing", "Текст для публикации", "Короткое описание / пост к ролику.", "fixed", 1500, "пост", { stage: "marketing", tags: ["копирайтинг"] }),

        item("transport", "logistics", "Транспорт по городу", "Минимальная логистика по Перми.", "perDay", 2000, "день", { stage: "shoot", tags: ["транспорт"] }),
        item("food", "logistics", "Питание команды", "Минимальный перекус / питание на съёмке.", "fixed+qty", 350, "чел", { stage: "shoot", tags: ["питание"] }),
        item("location_rent", "logistics", "Аренда простой локации", "Недорогая локация / помещение.", "perDay", 3000, "день", { stage: "shoot", tags: ["локация"] }),
        item("studio_basic", "logistics", "Студия базовая", "Базовая студия / помещение для записи интервью или контента.", "perDay", 5000, "день", { stage: "shoot", tags: ["студия"] }),
        item("props", "logistics", "Реквизит минимальный", "Небольшие предметы и расходники.", "fixed", 2000, "пакет", { stage: "shoot", tags: ["реквизит"] }),
        item("makeup", "shoot", "Визажист / грим", "Базовый макияж для интервью или съёмки эксперта.", "crewShift", 4000, "смена", {
          stage: "shoot", rates: { hour: 800, half: 3000, full: 4000, long: 6000, premium: 9000, overtimeHour: 650 }, tags: ["визаж"]
        }),

        // ── ИИ / Нейросети ───────────────────────────────────────────────
        item("ai_sub_service", "ai", "Подписка на AI-сервис", "Месячная подписка на AI-инструмент. Выбери сервис в строке сметы: Higgsfield, Syntex, Runway, Midjourney и др.", "fixed", 1990, "мес.", { stage: "pre", tags: ["ИИ", "подписка", "сервис"] }),
        item("ai_credits_1000", "ai", "AI-кредиты (1000 шт)", "Пакет 1000 кредитов/токенов для AI-генерации видео или изображений.", "fixed+qty", 2200, "пакет", { stage: "pre", tags: ["ИИ", "кредиты", "токены"] }),
        item("ai_credits_5000", "ai", "AI-кредиты (5000 шт)", "Пакет 5000 кредитов — базовый объём для полноценного AI-видеопроекта.", "fixed", 9900, "пакет", { stage: "pre", tags: ["ИИ", "кредиты"] }),
        item("ai_prompt_writing", "ai", "Написание промптов / раскадровка AI", "Разработка промптов, сценарий для AI, подбор референсов, раскадровка локаций.", "creativeWork", 5000, "проект", { stage: "pre", tags: ["ИИ", "промпты", "раскадровка"] }),
        item("ai_video_generation", "ai", "AI-генерация видеоряда", "Генерация видеоряда через AI-инструменты, отбор и подготовка кадров для монтажа.", "fixed", 10000, "проект", { stage: "post", tags: ["ИИ", "генерация", "видео"] }),
        item("ai_motion_graphics", "ai", "Моушн-дизайн и AI-графика", "Создание дополнительной графики, всплывающих элементов, титров на основе AI.", "fixed", 10000, "пакет", { stage: "post", tags: ["ИИ", "моушн", "графика"] }),
        item("ai_video_edit_integration", "ai", "Монтаж AI-контента + VFX", "Монтаж и визуальные эффекты: интеграция AI-видеоряда с реальными кадрами, переходы.", "videoEdit", 12000, "ролик", {
          stage: "post", rates: { base: 12000, perMinute: 3000, extraVersion: 2000, extraRevision: 1500, sourcePack: 1500 }, tags: ["ИИ", "монтаж", "VFX"]
        }),
        item("ai_sound_design", "ai", "Саунд-дизайн AI-видео", "Сведение голоса, музыки и интершумов для AI-ролика.", "fixed", 3000, "ролик", { stage: "post", tags: ["ИИ", "звук", "саунд"] }),
        item("ai_voice_synthesis", "ai", "ИИ-диктор / синтез голоса", "Генерация озвучки через AI, подбор и подготовка голоса, лицензия на синтез.", "fixed", 3000, "ролик", { stage: "post", tags: ["ИИ", "диктор", "голос"] }),
        item("ai_music_license", "ai", "Лицензионная музыка и SFX", "Лицензионный трек из библиотеки + звуковые эффекты для AI-видео.", "fixed", 2500, "пакет", { stage: "post", tags: ["музыка", "лицензия", "SFX"] }),
        item("ai_color_grade", "ai", "Цветокоррекция AI-видео", "Цветокоррекция AI-генерированного контента для единого визуального стиля.", "fixed", 3000, "ролик", { stage: "post", tags: ["ИИ", "цвет", "цветокоррекция"] }),
        item("ai_consulting", "ai", "Консультация по AI-продакшн", "Консультация по выбору инструментов, рабочий процессе и бюджету AI-проекта.", "fixed", 3500, "сессия", { stage: "pre", tags: ["ИИ", "консультация"] }),

        // ── Мероприятия ──────────────────────────────────────────────────
        item("event_host", "event", "Ведущий мероприятия", "Профессиональный ведущий: ведение программы, работа с аудиторией.", "perDay", 15000, "день", { stage: "shoot", tags: ["мероприятие", "ведущий"] }),
        item("event_cameraman", "event", "Оператор мероприятия", "Репортажная видеосъёмка события одной камерой.", "crewShift", 6000, "смена", {
          stage: "shoot", rates: { hour: 1000, half: 4000, full: 6000, long: 8500, premium: 12000, overtimeHour: 850 }, tags: ["мероприятие", "оператор"]
        }),
        item("event_photographer", "event", "Фотограф мероприятия", "Репортажная фотосъёмка, моментальная передача материала.", "crewShift", 5000, "смена", {
          stage: "shoot", rates: { hour: 900, half: 3500, full: 5000, long: 7000, premium: 10000, overtimeHour: 700 }, tags: ["мероприятие", "фото"]
        }),
        item("event_stream", "event", "Прямая трансляция (стрим)", "Настройка стрима, кодирование, трансляция на платформу.", "perDay", 15000, "день", { stage: "shoot", tags: ["мероприятие", "стрим", "трансляция"] }),
        item("event_multicam", "event", "Многокамерная съёмка (3 камеры)", "Многокамерная съёмка мероприятия с синхронизацией.", "fixed", 25000, "смена", { stage: "shoot", tags: ["мероприятие", "мультикам"] }),
        item("event_clip_edit", "event", "Монтаж ролика с мероприятия", "Итоговый ролик до 3 минут: нарезки, интервью, атмосфера.", "videoEdit", 8000, "ролик", {
          stage: "post", rates: { base: 8000, perMinute: 2000, extraVersion: 1200, extraRevision: 900, sourcePack: 800 }, tags: ["мероприятие", "монтаж"]
        }),
        item("event_teaser", "event", "Тизер / анонс мероприятия", "Короткий тизер или анонс до 60 секунд для продвижения события.", "videoEdit", 5000, "ролик", {
          stage: "post", rates: { base: 5000, perMinute: 2000, extraVersion: 1000, extraRevision: 700, sourcePack: 600 }, tags: ["мероприятие", "тизер"]
        }),
        item("event_decoration_zone", "event", "Оформление видео/фотозоны", "Простое оформление зоны для съёмки: фон, подсветка, реквизит.", "fixed", 8000, "пакет", { stage: "shoot", tags: ["мероприятие", "декор"] }),
        item("event_graphic_pack", "event", "Графический пакет мероприятия", "Афиши, баннеры, программа, брендинг события.", "fixed+qty", 1500, "шт", { stage: "marketing", tags: ["мероприятие", "графика", "баннер"] }),
        item("event_presenter_reel", "event", "Prezenter-ролик / спикер на камеру", "Запись спикера в зале или студии с телесуфлёром или шпаргалкой.", "crewShift", 7000, "смена", {
          stage: "shoot", rates: { hour: 1200, half: 5000, full: 7000, long: 10000, premium: 14000, overtimeHour: 1000 }, tags: ["мероприятие", "спикер"]
        }),
        item("event_sound_system", "event", "Аренда звукового оборудования", "Аренда микшера, колонок, микрофонов для мероприятия.", "perDay", 8000, "день", { stage: "shoot", tags: ["мероприятие", "звук", "аренда"] }),
        item("event_projector", "event", "Аренда проектора и экрана", "Проектор + экран для презентаций или выступлений.", "perDay", 5000, "день", { stage: "shoot", tags: ["мероприятие", "проектор"] })
      ];

      const DEFAULT_PACKAGES = [
        // ── Соц. сети (3 уровня) ─────────────────────────────────────
        {
          id: "social_start",
          name: "Соц. сети 1 — Старт",
          cat: "social", tier: 1,
          priceLabel: "от 18 000 ₽",
          desc: "Минимальный комплект для короткого ролика в соцсети.",
          goodFor: "эксперты, малый бизнес, услуги",
          items: ["idea", "script_short", "camera_operator", "camera_basic", "edit_short", "subtitles", "cover_design"],
          notes: ["Подходит для Reels, Shorts, VK Клипов.", "Не включает сложную графику и платные локации."]
        },
        {
          id: "social_pro",
          name: "Соц. сети 2 — Профи",
          cat: "social", tier: 2,
          priceLabel: "от 35 000 ₽",
          desc: "Расширенный комплект: съёмка + монтаж + субтитры + 3 адаптации форматов.",
          goodFor: "бренды, блогеры, маркетинг, регулярный контент",
          items: ["script_short", "shoot_plan", "camera_operator", "assistant", "camera_basic", "light_basic", "sound_kit", "edit_short", "subtitles", "smm_cutdowns", "thumbnail_pack", "cover_design", "vertical_adapt"],
          notes: ["3 ролика или 1 основной + нарезки за один день.", "Адаптация под Instagram, ВКонтакте, YouTube Shorts."]
        },
        {
          id: "social_media",
          name: "Соц. сети 3 — Медиа",
          cat: "social", tier: 3,
          priceLabel: "от 55 000 ₽",
          desc: "Полный медиапакет: контент-день, 5+ роликов, motion-элементы и поддержка публикаций.",
          goodFor: "активные бренды, продакшн-агентства, маркетинговые отделы",
          items: ["concept", "script_short", "content_day_plan", "shoot_plan", "camera_operator", "second_camera_operator", "assistant", "camera_basic", "light_plus", "sound_kit", "edit_short", "subtitles", "smm_cutdowns", "thumbnail_pack", "cover_design", "vertical_adapt", "motion_basic", "publication_support"],
          notes: ["Один контент-день — 5–7 готовых роликов.", "Включает motion-графику, обложки и помощь с публикацией."]
        },

        // ── Интервью (3 уровня) ──────────────────────────────────────
        {
          id: "interview_base",
          name: "Интервью 1 — Базовое",
          cat: "interview", tier: 1,
          priceLabel: "от 32 000 ₽",
          desc: "Интервью с экспертом или представителем компании.",
          goodFor: "экспертный контент, HR, обучение",
          items: ["interview_questions", "shoot_plan", "camera_operator", "soundman", "camera_basic", "light_basic", "sound_kit", "edit", "sound_post", "titles"],
          notes: ["Базовый вариант рассчитан на простую локацию.", "Можно добавить вторую камеру и расширенный свет."]
        },
        {
          id: "interview_studio",
          name: "Интервью 2 — Студийное",
          cat: "interview", tier: 2,
          priceLabel: "от 55 000 ₽",
          desc: "Профессиональное интервью в студии с постановочным светом и двумя камерами.",
          goodFor: "публичные персоны, CEO, HR-бренд, обучающий контент",
          items: ["interview_questions", "shoot_plan", "dop", "second_camera_operator", "soundman", "camera_pro", "lens_set", "light_plus", "sound_kit", "studio_basic", "edit", "color", "sound_post", "titles"],
          notes: ["Две камеры дают профессиональную «телевизионную» картинку.", "Студия — базовая (своя или арендованная)."]
        },
        {
          id: "interview_cinema",
          name: "Интервью 3 — Кино",
          cat: "interview", tier: 3,
          priceLabel: "от 80 000 ₽",
          desc: "Кинематографическое интервью: постановочный свет, два оператора, полный постпродакшн.",
          goodFor: "имидж-проекты, документальный стиль, серьёзные бренды",
          items: ["interview_questions", "concept", "shoot_plan", "director", "dop", "second_camera_operator", "gaffer", "soundman", "camera_pro", "lens_set", "light_plus", "sound_kit", "edit", "color", "sound_post", "motion_basic", "titles"],
          notes: ["Режиссёр + гаффер = кино-качество картинки и света.", "Чёрновой монтаж + 2 круга правок."]
        },

        // ── Бизнес-видео (3 уровня) ──────────────────────────────────
        {
          id: "business_video",
          name: "Бизнес-видео 1 — Старт",
          cat: "business", tier: 1,
          priceLabel: "от 55 000 ₽",
          desc: "Имиджевый или презентационный ролик для компании.",
          goodFor: "сайт, презентации, продажи, HR-бренд",
          items: ["concept", "script_full", "shoot_plan", "director", "dop", "assistant", "camera_pro", "lens_set", "light_plus", "edit", "color", "sound_post", "titles"],
          notes: ["Финальная цена зависит от количества сцен и локаций.", "Можно расширить до рекламного ролика."]
        },
        {
          id: "brand_film_mid",
          name: "Бизнес-видео 2 — Имиджевый",
          cat: "business", tier: 2,
          priceLabel: "от 85 000 ₽",
          desc: "Имиджевый фильм о компании 2–5 мин: команда, производство, интервью.",
          goodFor: "сайт компании, HR-бренд, инвесторы, партнёры",
          items: ["concept", "script_full", "shoot_plan", "director", "dop", "soundman", "producer", "camera_pro", "lens_set", "light_plus", "sound_kit", "edit", "color", "sound_post", "titles", "voiceover_record"],
          notes: ["Рекомендуем 2 съёмочных дня.", "Финальная цена зависит от кол-ва локаций."]
        },
        {
          id: "ad_video_pro",
          name: "Бизнес-видео 3 — Реклама",
          cat: "business", tier: 3,
          priceLabel: "от 150 000 ₽",
          desc: "Полноценный рекламный ролик 30–60 сек: концепция, продакшн, постпродакшн.",
          goodFor: "ТВ-реклама, digital, бренд-кампании",
          items: ["concept", "script_short", "storyboard", "shoot_plan", "director", "dop", "assistant", "makeup", "camera_pro", "lens_set", "light_plus", "soundman", "sound_kit", "producer", "location_rent", "edit", "color", "sound_post", "motion_basic", "titles", "voiceover_record"],
          notes: ["Финальный бюджет зависит от локаций, актёров и спецэффектов.", "До 2 кругов правок на каждом этапе."]
        },

        // ── Фото-контент (3 уровня) ──────────────────────────────────
        {
          id: "photo_content",
          name: "Фото 1 — Старт",
          cat: "photo", tier: 1,
          priceLabel: "от 14 000 ₽",
          desc: "Фотосъёмка и базовая обработка для сайта или соцсетей.",
          goodFor: "команда, товары, офис, мероприятия",
          items: ["photographer", "photo_retouch", "cover_design"],
          notes: ["Количество фото и глубина ретуши уточняются под задачу.", "Можно добавить визажиста и аренду студии."]
        },
        {
          id: "photo_content_pro",
          name: "Фото 2 — Профи",
          cat: "photo", tier: 2,
          priceLabel: "от 28 000 ₽",
          desc: "Профессиональная фотосессия в студии или на выезде: портреты, команда, товары.",
          goodFor: "команда, LinkedIn, сайт компании, HR, пресс-кит",
          items: ["photographer", "camera_pro", "lens_set", "light_plus", "photo_retouch", "cover_design"],
          notes: ["До 20 человек включительно.", "100+ обработанных фотографий."]
        },
        {
          id: "photo_content_premium",
          name: "Фото 3 — Премиум",
          cat: "photo", tier: 3,
          priceLabel: "от 50 000 ₽",
          desc: "Полный день коммерческой съёмки: товары, команда, репортаж, визаж.",
          goodFor: "каталоги, рекламные кампании, большие команды",
          items: ["photographer", "second_camera_operator", "makeup", "camera_pro", "lens_set", "light_plus", "studio_basic", "photo_retouch", "thumbnail_pack", "cover_design"],
          notes: ["Полный день съёмки.", "200+ обработанных фото, помощь с публикацией."]
        },

        // ── Контент-день ──────────────────────────────────────────────
        {
          id: "content_day",
          name: "Контент-день",
          cat: "social",
          priceLabel: "от 45 000 ₽",
          desc: "Один съёмочный день для серии коротких материалов.",
          goodFor: "регулярные соцсети, эксперты, отделы маркетинга",
          items: ["content_day_plan", "shoot_plan", "camera_operator", "assistant", "camera_basic", "light_basic", "sound_kit", "edit_short", "smm_cutdowns", "thumbnail_pack"],
          notes: ["Количество роликов зависит от сценариев и сложности монтажа.", "Можно добавить фотографа и публикационную поддержку."]
        },

        // ── Графика / Анимация (3 уровня) ────────────────────────────
        {
          id: "graphic_start",
          name: "Графика 1 — Старт",
          cat: "graphic", tier: 1,
          priceLabel: "от 15 000 ₽",
          desc: "Базовый набор графики: анимация логотипа, титры и простые переходы.",
          goodFor: "YouTube-каналы, блогеры, стартапы, стримеры",
          items: ["logo_anim", "titles", "cover_design"],
          notes: ["Простая анимация логотипа + базовые титры.", "Форматы MP4 и PNG для стриминговых платформ."]
        },
        {
          id: "graphic_pro",
          name: "Графика 2 — Профи",
          cat: "graphic", tier: 2,
          priceLabel: "от 35 000 ₽",
          desc: "Профессиональный пакет motion-графики: анимации, инфографика, брендинг видео.",
          goodFor: "YouTube-каналы, бренды, рекламодатели, корпоративные видео",
          items: ["concept", "storyboard", "motion_basic", "logo_anim", "titles", "thumbnail_pack", "cover_design", "sound_post"],
          notes: ["Разработка от раскадровки до финального рендера.", "Форматы After Effects + рендеры MP4/PNG."]
        },
        {
          id: "graphic_explainer",
          name: "Графика 3 — Explainer",
          cat: "graphic", tier: 3,
          priceLabel: "от 60 000 ₽",
          desc: "Анимационный объясняющий ролик 60–120 сек: визуализирует продукт, услугу или идею.",
          goodFor: "стартапы, SaaS, B2B, инвесторы, лендинги",
          items: ["script_full", "storyboard", "motion_basic", "logo_anim", "titles", "voiceover_text", "voiceover_record", "sound_post", "music"],
          notes: ["Сложность анимации влияет на стоимость.", "Включает текст диктора и профессиональную озвучку."]
        },

        // ── ИИ-пакеты (3 уровня) ─────────────────────────────────────
        {
          id: "ai_video_full",
          name: "AI-видео 3 — Полный цикл",
          cat: "ai", tier: 3,
          priceLabel: "от 74 000 ₽",
          desc: "Полное производство AI-видеоролика: промпты, генерация, монтаж, звук, графика, цвет. Аналог профессионального продакшна без съёмочной группы.",
          goodFor: "AI-продакшн, рекламодатели, агентства, стартапы",
          items: ["ai_sub_higgsfield", "ai_credits_5000", "ai_music_license", "ai_voice_synthesis", "ai_prompt_writing", "ai_video_generation", "ai_motion_graphics", "ai_video_edit_integration", "ai_sound_design", "ai_color_grade"],
          notes: [
            "Подписка Higgsfield + 5000 кредитов покрывают генерацию 1 ролика 30–90 сек.",
            "2 бесплатных круга правок на этапе чернового монтажа.",
            "50% предоплата до запуска, 50% после сдачи."
          ]
        },
        {
          id: "ai_video_short",
          name: "AI-видео 1 — Старт",
          cat: "ai", tier: 1,
          priceLabel: "от 25 000 ₽",
          desc: "Быстрый AI-ролик до 30 секунд для соцсетей: промпты, генерация, монтаж и обложка.",
          goodFor: "Reels, TikTok, соцсети, быстрый запуск",
          items: ["ai_sub_higgsfield", "ai_credits_1000", "ai_prompt_writing", "ai_video_generation", "edit_short", "cover_design"],
          notes: ["Экономичный вариант для регулярного AI-контента в соцсетях.", "Без диктора и сложной графики — только видеоряд и монтаж."]
        },
        {
          id: "ai_product_promo",
          name: "AI-видео 2 — Промо",
          cat: "ai", tier: 2,
          priceLabel: "от 45 000 ₽",
          desc: "Промо-ролик продукта или услуги на базе AI-генерации с дикторским голосом и моушн-графикой.",
          goodFor: "товары, приложения, сервисы, лендинги",
          items: ["ai_sub_syntex", "ai_credits_1000", "ai_prompt_writing", "ai_video_generation", "ai_voice_synthesis", "ai_motion_graphics", "ai_video_edit_integration", "ai_music_license"],
          notes: ["Syntex + промпты дают визуальный ряд под продукт.", "Добавь Higgsfield для плавного движения камеры."]
        },

        // ── Мероприятия (3 уровня) ────────────────────────────────────
        {
          id: "event_basic",
          name: "Мероприятие 1 — Базовое",
          cat: "events", tier: 1,
          priceLabel: "от 38 000 ₽",
          desc: "Видеосъёмка события двумя операторами, монтаж ролика и нарезки для соцсетей.",
          goodFor: "корпоративы, дни открытых дверей, небольшие конференции",
          items: ["event_cameraman", "event_photographer", "camera_basic", "sound_kit", "event_clip_edit", "smm_cutdowns"],
          notes: ["Два оператора покрывают зал и кулуары.", "Итоговый ролик до 3 мин + 3–5 коротких нарезок для соцсетей."]
        },
        {
          id: "event_conference",
          name: "Мероприятие 2 — Конференция",
          cat: "events", tier: 2,
          priceLabel: "от 85 000 ₽",
          desc: "Многокамерная съёмка конференции, интервью со спикерами, стрим и монтаж полной версии.",
          goodFor: "бизнес-форумы, IT-конференции, отраслевые события",
          items: ["event_multicam", "event_stream", "event_presenter_reel", "soundman", "sound_kit", "edit", "color", "event_clip_edit", "event_graphic_pack"],
          notes: ["3 камеры + стрим — стандарт для серьёзных конференций.", "Интервью со спикерами монтируются отдельно."]
        },
        {
          id: "event_online",
          name: "Мероприятие 3 — Онлайн / стрим",
          cat: "events", tier: 3,
          priceLabel: "от 32 000 ₽",
          desc: "Прямая трансляция вебинара или онлайн-ивента с записью и монтажом итогового ролика.",
          goodFor: "вебинары, онлайн-конференции, запуски продуктов",
          items: ["event_stream", "soundman", "sound_kit", "edit"],
          notes: ["Настройка стрима + чистый звук = профессиональный вебинар.", "Запись сохраняется для последующего монтажа."]
        },

        // ── Продакшн: расширенные ─────────────────────────────────────────
        {
          id: "brand_film",
          name: "Имиджевый фильм о компании",
          cat: "business",
          priceLabel: "от 85 000 ₽",
          desc: "Полноценный имиджевый ролик 2–5 минут: концепция, съёмка, интервью, монтаж, цвет, звук.",
          goodFor: "сайт компании, HR-бренд, инвесторы, партнёры",
          items: ["concept", "script_full", "shoot_plan", "director", "dop", "soundman", "producer", "camera_pro", "lens_set", "light_plus", "sound_kit", "edit", "color", "sound_post", "titles", "voiceover_record"],
          notes: ["Финальная цена зависит от кол-ва локаций и дней съёмки.", "Рекомендуем 2 съёмочных дня."]
        },
        {
          id: "reels_series",
          name: "Серия Reels / Shorts (5 роликов)",
          cat: "social",
          priceLabel: "от 55 000 ₽",
          desc: "Пять коротких роликов для соцсетей, снятых за один контент-день и смонтированных.",
          goodFor: "регулярный контент, эксперты, блогеры, бренды",
          items: ["content_day_plan", "shoot_plan", "camera_operator", "camera_basic", "light_basic", "sound_kit", "edit_short", "edit_short", "edit_short", "smm_cutdowns", "thumbnail_pack"],
          notes: ["5 роликов по 15–60 сек за один день съёмки.", "В монтаж входят субтитры и базовые переходы."]
        },
        {
          id: "youtube_project",
          name: "YouTube-проект / обзор",
          cat: "business",
          priceLabel: "от 65 000 ₽",
          desc: "Обзорное или обучающее YouTube-видео 5–15 минут: сценарий, съёмка, монтаж, анимации.",
          goodFor: "YouTube-каналы, обзоры, туториалы, экспертный контент",
          items: ["script_full", "shoot_plan", "dop", "camera_pro", "light_plus", "soundman", "sound_kit", "edit", "color", "sound_post", "motion_basic", "titles", "thumbnail_pack", "vertical_adapt"],
          notes: ["Длительные видео требуют больше времени на монтаж.", "Вертикальная адаптация для Shorts включена."]
        },

        // ── Свадьба и семья ───────────────────────────────────────────────
        {
          id: "wedding_full",
          name: "Свадьба — полный день",
          cat: "photo",
          priceLabel: "от 120 000 ₽",
          desc: "Полная видеосъёмка свадьбы: сборы, церемония, банкет. Свадебный фильм + клип + фото.",
          goodFor: "свадьбы, торжества, выездные регистрации",
          items: ["dop", "camera_operator", "second_camera_operator", "photographer", "soundman", "camera_pro", "lens_set", "light_plus", "sound_kit", "stabilizer", "edit", "color", "sound_post", "music", "photo_retouch"],
          notes: ["Съёмочный день до 12 часов.", "Свадебный фильм 15–25 мин + эмоциональный клип 3–5 мин + обработанные фото."]
        },
        {
          id: "wedding_mini",
          name: "Свадьба — мини",
          cat: "photo",
          priceLabel: "от 55 000 ₽",
          desc: "Компактная съёмка: ЗАГС + прогулка. Видеоклип и фото без банкета.",
          goodFor: "небольшие свадьбы, расписка, камерные торжества",
          items: ["camera_operator", "photographer", "camera_pro", "lens_set", "light_basic", "stabilizer", "edit_short", "color", "music", "photo_retouch"],
          notes: ["Съёмка до 5 часов.", "Клип 3–5 мин + 50 обработанных фото."]
        },
        {
          id: "love_story",
          name: "Love Story / Фотосессия пары",
          cat: "photo",
          priceLabel: "от 22 000 ₽",
          desc: "Романтическая фото- и видеосессия пары на природе или в городе.",
          goodFor: "пары, love story, годовщины, предложение руки",
          items: ["photographer", "camera_operator", "camera_pro", "lens_set", "light_basic", "photo_retouch", "cover_design"],
          notes: ["Сессия 2–3 часа.", "60+ обработанных фото + короткое видео-видеозарисовка 1–2 мин."]
        },
        {
          id: "kids_photo",
          name: "Детская / Семейная съёмка",
          cat: "photo",
          priceLabel: "от 18 000 ₽",
          desc: "Фотосъёмка детей и семьи в студии или на выезде.",
          goodFor: "дети, семьи, праздники, дни рождения",
          items: ["photographer", "camera_basic", "light_basic", "props", "photo_retouch"],
          notes: ["Сессия 1.5–2 часа.", "50+ обработанных фотографий.", "Студия или выездная локация — по договорённости."]
        },

        // ── Реклама и графика ─────────────────────────────────────────────
        {
          id: "ad_video_full",
          name: "Рекламный ролик — полный цикл",
          cat: "business",
          priceLabel: "от 150 000 ₽",
          desc: "Полноценный рекламный ролик 30–60 сек: концепция, продакшн, постпродакшн.",
          goodFor: "ТВ-реклама, digital, бренд-кампании, e-com",
          items: ["concept", "script_short", "storyboard", "shoot_plan", "director", "dop", "assistant", "makeup", "camera_pro", "lens_set", "light_plus", "soundman", "sound_kit", "producer", "location_rent", "edit", "color", "sound_post", "motion_basic", "titles", "voiceover_record"],
          notes: ["Финальный бюджет зависит от локаций, актёров и спецэффектов.", "Включает до 2 кругов правок на каждом этапе."]
        },
        {
          id: "motion_pack",
          name: "Motion-графика / Анимация",
          cat: "graphic",
          priceLabel: "от 35 000 ₽",
          desc: "Анимационный ролик до 60 сек: моушн, инфографика, анимированный логотип, заставки.",
          goodFor: "презентации, YouTube, соцсети, рекламные вставки",
          items: ["concept", "storyboard", "motion_basic", "logo_anim", "titles", "sound_post", "music"],
          notes: ["Разработка от раскадровки до финального рендера.", "Формат MP4, MOV. Все исходники передаются."]
        },
        {
          id: "explainer_video",
          name: "Explainer / Презентационная анимация",
          cat: "graphic",
          priceLabel: "от 60 000 ₽",
          desc: "Объясняющий анимационный ролик 60–120 сек: визуализирует продукт, услугу или идею.",
          goodFor: "стартапы, SaaS, B2B, инвесторы, лендинги",
          items: ["script_full", "storyboard", "motion_basic", "logo_anim", "titles", "voiceover_text", "voiceover_record", "sound_post", "music"],
          notes: ["Сложность анимации влияет на стоимость.", "Включает написание текста диктора и профессиональную озвучку."]
        },
        {
          id: "brand_graphics_pack",
          name: "Графический пакет для бренда",
          cat: "graphic",
          priceLabel: "от 25 000 ₽",
          desc: "Анимированный логотип, интро/аутро, нижние трети, шаблоны для соцсетей.",
          goodFor: "YouTube-каналы, блогеры, бренды, продакшн-студии",
          items: ["logo_anim", "titles", "motion_basic", "thumbnail_pack", "cover_design"],
          notes: ["Полный набор для брендирования видеоконтента.", "Форматы After Effects + рендеры MP4/PNG."]
        },

        // ── Кино-интервью и документалистика ─────────────────────────────
        {
          id: "cinematic_interview",
          name: "Кино-интервью / Спикер",
          cat: "interview",
          priceLabel: "от 45 000 ₽",
          desc: "Профессиональное кино-интервью с постановочным светом, двумя камерами и чистым звуком.",
          goodFor: "эксперты, CEO, спикеры, HR-бренд, публичные персоны",
          items: ["interview_questions", "shoot_plan", "dop", "second_camera_operator", "gaffer", "soundman", "camera_pro", "lens_set", "light_plus", "sound_kit", "edit", "color", "sound_post", "titles"],
          notes: ["Два ракурса дают профессиональную «телевизионную» картинку.", "Включает черновой монтаж + 2 круга правок."]
        },
        {
          id: "documentary_short",
          name: "Документальный мини-фильм",
          cat: "business",
          priceLabel: "от 90 000 ₽",
          desc: "Короткий документальный фильм 5–15 мин о человеке, бизнесе или событии.",
          goodFor: "бизнес-истории, социальные проекты, личный бренд",
          items: ["concept", "script_full", "shoot_plan", "director", "dop", "soundman", "producer", "camera_pro", "lens_set", "light_plus", "sound_kit", "stabilizer", "drone", "edit", "color", "sound_post", "music", "titles", "voiceover_record"],
          notes: ["Съёмка 2–3 дня.", "Финальный монтаж с цветокоррекцией, саундтреком и дикторским текстом."]
        },

        // ── Корпоративный продакшн (3 уровня) ────────────────────────────
        {
          id: "corporate_start",
          name: "Корпоратив 1 — Старт",
          cat: "corporate", tier: 1,
          priceLabel: "от 28 000 ₽",
          desc: "Базовый корпоративный контент: фотосессия команды и короткое видео-приветствие.",
          goodFor: "HR-бренд, сайт, соцсети компании",
          items: ["photographer", "camera_operator", "camera_basic", "light_basic", "photo_retouch", "cover_design", "edit_short"],
          notes: ["Один день съёмки.", "Фото команды + видео-визитка 1–2 мин."]
        },
        {
          id: "corporate_video",
          name: "Корпоратив 2 — Профи",
          cat: "corporate", tier: 2,
          priceLabel: "от 75 000 ₽",
          desc: "Имиджевый корпоративный фильм: команда, офис, производство, интервью сотрудников.",
          goodFor: "HR-бренд, инвесторы, партнёры, сайт компании",
          items: ["concept", "script_full", "shoot_plan", "director", "camera_operator", "second_camera_operator", "gaffer", "soundman", "camera_pro", "lens_set", "light_plus", "sound_kit", "producer", "edit", "color", "sound_post", "motion_basic", "titles"],
          notes: ["2–3 съёмочных дня.", "Финальный ролик 3–5 мин + версии для соцсетей."]
        },
        {
          id: "corporate_premium",
          name: "Корпоратив 3 — Премиум",
          cat: "corporate", tier: 3,
          priceLabel: "от 140 000 ₽",
          desc: "Полный корпоративный медиапакет: имиджевый фильм, фотосессия, интервью топ-менеджмента, серия для соцсетей.",
          goodFor: "крупные компании, ESG-отчётность, IPO, корпоративный PR",
          items: ["concept", "script_full", "shoot_plan", "director", "dop", "second_camera_operator", "gaffer", "soundman", "producer", "photographer", "camera_pro", "lens_set", "light_plus", "sound_kit", "edit", "color", "sound_post", "motion_basic", "titles", "voiceover_record", "photo_retouch", "smm_cutdowns"],
          notes: ["3–4 съёмочных дня, несколько локаций.", "Имиджевый ролик 5–7 мин + 3 коротких для соцсетей + 100+ обработанных фото."]
        },
        {
          id: "teambuilding_photo",
          name: "Корпоративная фотосъёмка",
          cat: "corporate",
          priceLabel: "от 28 000 ₽",
          desc: "Профессиональная фотосессия команды в офисе или на выезде: портреты и групповые фото.",
          goodFor: "команда, LinkedIn, сайт компании, HR, пресс-кит",
          items: ["photographer", "camera_pro", "lens_set", "light_plus", "photo_retouch", "cover_design"],
          notes: ["До 20 человек включительно.", "100+ обработанных фотографий, индивидуальные портреты + группы."]
        }
      ];

      function validatePhone(phone) {
        if (!phone || !String(phone).trim()) return true;
        const cleaned = String(phone).replace(/[\s\-\(\)\.]/g, "");
        return /^(\+7|7|8)\d{10}$/.test(cleaned);
      }

      function checkPhoneField(input) {
        const val = input.value;
        let msg = input.parentElement.querySelector(".field-error-msg");
        if (!validatePhone(val)) {
          input.classList.add("input-error");
          if (!msg) {
            msg = document.createElement("span");
            msg.className = "field-error-msg";
            input.parentElement.appendChild(msg);
          }
          msg.textContent = "Неверный формат. Пример: +7 900 000-00-00";
        } else {
          input.classList.remove("input-error");
          if (msg) msg.remove();
        }
      }

      /* ═══════════════════════════════════════════════════════
         SUPABASE ADMIN & REAL-TIME SYNC
      ═══════════════════════════════════════════════════════ */
      let _supabase = null;
      let _realtimeChannel = null;
      let _adminSession = null;
      let _broadcastTimer = null;
      let _userProfile = null;   // { subscription_status, subscription_plan, subscription_expires_at, agency_id }
      let _cloudSaveTimer = null;
      let _onlineUsers = [];
      let _authChecking = true;
      let _dataLoading = false; // true while loading profile + cloud state from Supabase
      let _pendingInviteCode = ""; // set during registration if user entered invite code
      let _buyingPlan = null; // planId currently being purchased (shows loading state)
      let _promoCode  = "";   // raw input value
      let _promoState = null; // null=idle | "checking" | {code,discount} | "invalid"
      let _briefAgencyId = (new URLSearchParams(location.search).get('brief') || '').trim();
      let _portalId = (new URLSearchParams(location.search).get('portal') || '').trim();
      let _portalData = null;
      let _portalLoaded = false;
      let _briefForm = { name:'', phone:'', email:'', company:'', city:'', type:'', format:'', duration:'', desc:'', budget:'', deadline:'', references:'', extra:'', source:'', sending:false, sent:false, error:'' };
      let _briefs = [];
      let _briefsLoaded = false;

      const _DEFAULT_SB_URL    = "https://qzeylogyledmhjpzvgkk.supabase.co";
      const _DEFAULT_SB_KEY    = "sb_publishable_E9JgbQiA7namAFiZAAbZEQ_aBn11VgJ";
      const _DEFAULT_VK_APP_ID = "54626328";

      function getSupabaseConfig() {
        return {
          url: localStorage.getItem("sb_url") || _DEFAULT_SB_URL,
          key: localStorage.getItem("sb_key") || _DEFAULT_SB_KEY
        };
      }

      function initSupabase() {
        const { url, key } = getSupabaseConfig();
        if (!url || !key || !window.supabase) { _authChecking = false; renderAuthGateEl(); return; }
        try {
          _supabase = window.supabase.createClient(url, key);
          // Быстрая проверка сохранённой сессии — не показываем auth gate до её результата
          _supabase.auth.getSession().then(({ data: { session } }) => {
            _authChecking = false;
            if (session) { _adminSession = session; _onUserLoggedIn(session); }
            else { renderAuthGateEl(); }
          });
          _supabase.auth.onAuthStateChange((event, session) => {
            _adminSession = session;
            if (session) { _onUserLoggedIn(session); }
            else {
              _userProfile = null;
              _onlineUsers = [];
              _briefs = []; _briefsLoaded = false;
              if (_realtimeChannel) { _realtimeChannel.unsubscribe(); _realtimeChannel = null; }
              renderAdminTopbar();
              render();
            }
          });
        } catch(e) { _authChecking = false; renderAuthGateEl(); console.warn("Supabase init:", e); }
      }

      /* Цели в Яндекс.Метрике для воронки регистрация → триал → оплата */
      function trackGoal(name, params) {
        try { window.ym && window.ym(109706942, "reachGoal", name, params); } catch(e) {}
      }

      async function _onUserLoggedIn(session) {
        _dataLoading = true;
        renderAdminTopbar();
        render();
        await _loadUserProfile(session.user.id, session.user.email);
        // Если в браузере данные другого агентства — чистим localStorage чтобы
        // новый пользователь не видел чужие сделки/клиентов
        const currentAgencyId = getAgencyId();
        const lastAgencyId = localStorage.getItem(LAST_AGENCY_KEY);
        if (lastAgencyId && lastAgencyId !== currentAgencyId) {
          state = defaultState();
          localStorage.removeItem(STORAGE_KEY);
        }
        localStorage.setItem(LAST_AGENCY_KEY, currentAgencyId);
        await _loadCloudState();
        _dataLoading = false;
        _initRealtimeChannel();
        renderAdminTopbar();
        render();
        checkPaymentReturn();
      }

      async function _loadUserProfile(userId, email) {
        if (!_supabase) return;
        try {
          const { data } = await _supabase.from("profiles").select("*").eq("id", userId).single();
          if (data) {
            _userProfile = data;
            // Migrate old profiles: set agency_id = own userId if missing
            if (!_userProfile.agency_id) {
              _userProfile.agency_id = userId;
              await _supabase.from("profiles").update({ agency_id: userId }).eq("id", userId);
            }
            // Sync avatar from cloud to local settings
            if (data.avatar_url) {
              const local = getUserSettings();
              if (!local.avatarDataUrl || local.avatarDataUrl !== data.avatar_url) {
                saveUserSettings({ avatarDataUrl: data.avatar_url });
              }
            }
          } else {
            // First-time user — create profile
            const trial_expires = new Date(Date.now() + 14 * 86400000).toISOString();
            const inviteCode = (_pendingInviteCode || "").trim();
            let agencyId = inviteCode || userId;
            let joinedTeam = inviteCode && inviteCode !== userId;

            // Check user limit for the agency being joined
            if (joinedTeam) {
              const { data: ownerProfile } = await _supabase.from("profiles").select("subscription_plan,subscription_status").eq("id", inviteCode).single();
              const { count: memberCount } = await _supabase.from("profiles").select("id", { count: "exact", head: true }).eq("agency_id", inviteCode);
              const planConfig = PLANS.find(p => p.id === (ownerProfile && ownerProfile.subscription_plan)) || PLANS[1];
              const maxUsers = planConfig.maxUsers || 1;
              if ((memberCount || 0) >= maxUsers) {
                agencyId = userId; // reject invite, create own account
                joinedTeam = false;
                setTimeout(() => toast(`⚠️ Агентство достигло лимита пользователей (${maxUsers}) по тарифу. Создан личный аккаунт.`), 1200);
              }
            }

            const newProfile = {
              id: userId, email,
              agency_id: agencyId,
              subscription_status: "trial",
              subscription_plan: "pro",
              subscription_expires_at: trial_expires
            };
            await _supabase.from("profiles").upsert(newProfile);
            _userProfile = newProfile;
            _pendingInviteCode = "";
            if (!joinedTeam) trackGoal("trial_started");
            setTimeout(() => {
              if (joinedTeam) {
                pushNotification("info", "👥 Вы вошли в команду!", "Теперь вы работаете в общем рабочем пространстве агентства.", "");
                toast("👥 Вы присоединились к агентству!");
              } else {
                pushNotification("info", "👋 Добро пожаловать в ADERVIS CRM!", "У вас 14 дней бесплатного доступа. Создайте первую сделку!", "");
                toast("🎉 Аккаунт создан! 14 дней бесплатно.");
              }
            }, 1200);
          }
        } catch(e) { console.warn("Profile load:", e); }
      }

      function getAgencyId() {
        return (_userProfile && _userProfile.agency_id) || (_adminSession && _adminSession.user.id) || "local";
      }

      async function _loadCloudState() {
        if (!_supabase || !_adminSession) return;
        const agencyId = getAgencyId();
        try {
          const { data } = await _supabase.from("agency_state").select("state_json").eq("id", agencyId).single();
          if (data && data.state_json) {
            const cloudState = data.state_json;
            const skipKeys = ["view","mainMenuOpen","adminModal","clientModal","taskModal","financeModal","editTransactionModal","wizard","clientDraft","dealModal","dealSwitcherOpen"];
            Object.entries(cloudState).forEach(([k, v]) => {
              if (!skipKeys.includes(k)) state[k] = v;
            });
            toast("☁️ Данные загружены из облака");
          }
        } catch(e) { console.warn("Cloud load:", e); }
      }

      function saveToCloud() {
        if (!_supabase || !_adminSession) return;
        const agencyId = getAgencyId();
        clearTimeout(_cloudSaveTimer);
        _cloudSaveTimer = setTimeout(async () => {
          const skipKeys = ["view","mainMenuOpen","adminModal","clientModal","taskModal","financeModal","editTransactionModal","wizard","clientDraft","dealModal","dealSwitcherOpen"];
          const data = Object.fromEntries(Object.entries(state).filter(([k]) => !skipKeys.includes(k)));
          try {
            await _supabase.from("agency_state").upsert({ id: agencyId, state_json: data, updated_at: new Date().toISOString() });
          } catch(e) { console.warn("Cloud save:", e); }
        }, 3000);
      }

      const SUPER_ADMIN_EMAIL = "adervis.digital@gmail.com";

      function isSubscriptionActive() {
        if (_adminSession && _adminSession.user.email === SUPER_ADMIN_EMAIL) return true;
        if (!_userProfile) return true; // no supabase = local mode, allow all
        const s = _userProfile.subscription_status;
        if (s === "active") return true;
        if (s === "trial") {
          const exp = _userProfile.subscription_expires_at;
          return !exp || new Date(exp) > new Date();
        }
        return false;
      }

      function getSubscriptionLabel() {
        if (_adminSession && _adminSession.user.email === SUPER_ADMIN_EMAIL) return "Super Admin ∞";
        if (!_userProfile) return "";
        const s = _userProfile.subscription_status;
        const plan = _userProfile.subscription_plan || "pro";
        const exp = _userProfile.subscription_expires_at;
        if (s === "trial") {
          const days = exp ? Math.max(0, Math.round((new Date(exp) - new Date()) / 86400000)) : 0;
          return `Пробный · осталось ${days} д.`;
        }
        if (s === "active") return `${plan === "team" ? "Команда" : "Про"} ✓`;
        if (s === "expired") return "Подписка истекла";
        if (s === "cancelled") return "Подписка отменена";
        return s;
      }

      function _initRealtimeChannel() {
        if (!_supabase) return;
        if (_realtimeChannel) _realtimeChannel.unsubscribe();
        const myEmail = _adminSession && _adminSession.user && _adminSession.user.email || "";
        const _channelAgencyId = getAgencyId();
        _realtimeChannel = _supabase.channel(`adervis-crm-${_channelAgencyId}`, {
          config: { presence: { key: myEmail } }
        });
        _realtimeChannel
          .on("broadcast", { event: "state-sync" }, ({ payload }) => {
            if (!payload || !payload.data) return;
            if (payload.sender && payload.sender === myEmail) return;
            const incoming = payload.data;
            const skipKeys = ["view","mainMenuOpen","adminModal","clientModal","taskModal","financeModal","editTransactionModal","wizard","clientDraft","dealModal","dealSwitcherOpen"];
            skipKeys.forEach(k => { if (k in state) incoming[k] = state[k]; });
            Object.assign(state, incoming);
            render();
            toast("🔄 Обновление от " + (payload.sender || "коллеги"));
          })
          .on("presence", { event: "sync" }, () => {
            const presState = _realtimeChannel.presenceState();
            _onlineUsers = Object.keys(presState).filter(k => k !== myEmail && k !== "");
            renderAdminTopbar();
          })
          .on("postgres_changes", {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: _adminSession ? `id=eq.${_adminSession.user.id}` : undefined
          }, (payload) => {
            if (payload.new) {
              _userProfile = Object.assign({}, _userProfile, payload.new);
              renderAdminTopbar();
              render();
            }
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED" && myEmail) {
              await _realtimeChannel.track({ email: myEmail });
            }
          });
      }

      function broadcastState() {
        if (!_realtimeChannel || !_adminSession) return;
        clearTimeout(_broadcastTimer);
        _broadcastTimer = setTimeout(() => {
          const skipKeys = ["view","mainMenuOpen","adminModal","clientModal","taskModal","financeModal","editTransactionModal","wizard","clientDraft","dealModal","dealSwitcherOpen"];
          const data = Object.fromEntries(Object.entries(state).filter(([k]) => !skipKeys.includes(k)));
          _realtimeChannel.send({ type: "broadcast", event: "state-sync",
            payload: { data, sender: _adminSession.user.email } });
        }, 1200);
      }

      function renderAdminTopbar() {
        if (_briefAgencyId) return;
        const el = document.getElementById("adminTopbar");
        if (!el) return;
        if (_adminSession) {
          const email = _adminSession.user.email || "";
          const name = email.split("@")[0];
          const subLabel = getSubscriptionLabel();
          const active = isSubscriptionActive();
          const presenceHtml = _onlineUsers.length
            ? `<span class="presence-area">${_onlineUsers.map(u => {
                const initials = (u.split("@")[0] || "?").slice(0, 2).toUpperCase();
                return `<span class="presence-dot" title="${escapeHtml(u)} — онлайн">${initials}</span>`;
              }).join("")}</span>`
            : "";
          el.innerHTML = `
            ${presenceHtml}
            <span class="admin-indicator" style="${!active ? "border-color:rgba(220,38,38,.4);background:rgba(220,38,38,.08)" : ""}">
              ${name}${subLabel ? ` <span style="font-weight:500;opacity:.75;font-size:10px">· ${subLabel}</span>` : ""}
            </span>
          `;
        } else {
          el.innerHTML = `<button class="btn small" onclick="app.exitLocalModeAndLogin()">🔐 Войти</button>`;
        }
      }

      function openAdminModal() {
        state.adminModal = { email: "", password: "", loading: false, error: "" };
        render();
      }

      function closeAdminModal() {
        state.adminModal = null;
        render();
      }

      function setAdminField(key, value) {
        if (!state.adminModal) return;
        state.adminModal[key] = value;
      }

      async function adminLogin() {
        if (!state.adminModal) return;
        const { email, password } = state.adminModal;
        if (!email || !password) { toast("Введите email и пароль"); return; }
        if (!_supabase) { toast("❌ Supabase не настроен. Укажите URL и ключ в Настройках."); return; }
        state.adminModal.loading = true;
        render();
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) {
          state.adminModal.loading = false;
          state.adminModal.error = error.message || "Ошибка входа";
          render();
          return;
        }
        state.adminModal = null;
        toast("✅ Вы вошли как " + email);
        render();
      }

      async function adminLogout() {
        if (!_supabase) return;
        await _supabase.auth.signOut();
        _adminSession = null;
        renderAdminTopbar();
        toast("Выход выполнен");
      }

      function saveSupabaseConfig() {
        const url = document.getElementById("sb_url_input") && document.getElementById("sb_url_input").value.trim();
        const key = document.getElementById("sb_key_input") && document.getElementById("sb_key_input").value.trim();
        if (!url || !key) { toast("Введите URL и ключ"); return; }
        localStorage.setItem("sb_url", url);
        localStorage.setItem("sb_key", key);
        const vkId = (document.getElementById("vk_app_id_input")?.value || '').trim();
        if (vkId) localStorage.setItem("vk_app_id", vkId);
        else localStorage.removeItem("vk_app_id");
        toast("✅ Сохранено. Обновите страницу для подключения.");
      }

      /* ═══════════════════════════════════════════════════════
         AUTH GATE
      ═══════════════════════════════════════════════════════ */
      let _authTab = "login"; // "login" | "register" | "forgot"
      let _authFields = { email: "", password: "", name: "", inviteCode: "", error: "", loading: false, showPassword: false, rememberMe: true, consent: false, forgotSent: false };

      function renderAuthGate() {
        const f = _authFields;

        const landingLeft = `
          <div class="auth-gate-left">
            <div class="auth-gate-brand">
              <div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,var(--primary),var(--blue));display:grid;place-items:center;flex-shrink:0">
                <img src="logo-icon.svg" alt="A" onerror="this.style.display='none'" style="width:34px;height:34px;object-fit:contain">
              </div>
              <div>
                <div style="font-weight:900;font-size:20px;letter-spacing:-.3px">ADERVIS CRM</div>
                <div style="font-size:12px;color:var(--muted)">CRM для видеопродакшна</div>
              </div>
            </div>

            <h2 style="font-size:26px;font-weight:900;line-height:1.2;margin:28px 0 12px;letter-spacing:-.4px">Управляйте студией<br>как профессионал</h2>
            <p style="font-size:14px;color:var(--muted);line-height:1.6;margin:0 0 28px">Всё для видеопродакшна: сделки, сметы, КП,<br>финансы, договора и задачи — в одном месте.</p>

            <ul class="auth-features-list">
              <li><span class="auth-feat-icon">📋</span><div><strong>Калькулятор смет</strong><span>Быстро считайте КП с пакетами услуг</span></div></li>
              <li><span class="auth-feat-icon">💼</span><div><strong>Воронка продаж</strong><span>Ведите сделки от брифа до оплаты</span></div></li>
              <li><span class="auth-feat-icon">💰</span><div><strong>Финансы и аналитика</strong><span>Доходы, расходы, рентабельность</span></div></li>
              <li><span class="auth-feat-icon">📅</span><div><strong>Задачи и дедлайны</strong><span>Командный календарь и уведомления</span></div></li>
              <li><span class="auth-feat-icon">📄</span><div><strong>Договора и КП</strong><span>Профессиональные шаблоны для клиентов</span></div></li>
            </ul>

            <div style="display:flex;gap:10px;align-items:flex-start;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.18);border-radius:12px;padding:12px 14px;margin-bottom:24px">
              <span style="font-size:18px;line-height:1.3">🎬</span>
              <p style="margin:0;font-size:12px;line-height:1.6;color:var(--muted)">ADERVIS CRM создали люди из видеопродакшна — нам самим не хватало удобного инструмента для сделок, смет и финансов. Когда поняли, что он закрывает настоящую боль студий, открыли доступ другим командам.</p>
            </div>

            <div class="auth-stats-row">
              <div><strong>14</strong><span>дней бесплатно</span></div>
              <div><strong>от 890₽</strong><span>в месяц</span></div>
              <div><strong>∞</strong><span>сделок</span></div>
            </div>
            <p style="margin:14px 0 0;font-size:11px;color:var(--muted);display:flex;align-items:center;gap:6px">🔒 Карта не нужна для пробного периода — оплата только если решите остаться</p>
          </div>
        `;

        /* ── Forgot password form ── */
        if (_authTab === "forgot") {
          return `
            <div class="auth-gate">
              <div class="auth-gate-inner">
                ${landingLeft}
                <div class="auth-gate-right">
                  <div class="auth-gate-box">
                    <div class="auth-gate-logo">
                      <div class="logo" style="width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,var(--primary),var(--blue));display:grid;place-items:center">
                        <img src="logo-icon.svg" alt="A" onerror="this.style.display='none'" style="width:24px;height:24px;object-fit:contain">
                      </div>
                      <div>
                        <div style="font-weight:900;font-size:15px">ADERVIS CRM</div>
                        <div style="font-size:11px;color:var(--muted)">CRM для видеопродакшна</div>
                      </div>
                    </div>
                    <h3 style="font-size:16px;margin:0 0 8px">Сброс пароля</h3>
                    <p style="font-size:13px;color:var(--muted);margin:0 0 18px;line-height:1.5">Введите email — мы отправим ссылку для восстановления пароля.</p>
                    ${f.error ? `<div style="background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);border-radius:10px;padding:10px 14px;color:var(--red);font-size:13px;margin-bottom:14px">${escapeHtml(f.error)}</div>` : ""}
                    ${f.forgotSent ? `<div style="background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.3);border-radius:10px;padding:10px 14px;color:var(--green);font-size:13px;margin-bottom:14px">📧 Ссылка отправлена на ${escapeHtml(f.email)}. Проверьте почту и перейдите по ссылке.</div>` : ""}
                    <div class="field" style="margin-bottom:16px"><label>Email</label>
                      <input type="email" placeholder="you@example.com" value="${escapeHtml(f.email)}" oninput="app.setAuthField('email',this.value)" onkeydown="if(event.key==='Enter')app.forgotPasswordSubmit()">
                    </div>
                    <button class="btn primary full" onclick="app.forgotPasswordSubmit()" ${f.loading || f.forgotSent ? "disabled" : ""} style="width:100%;padding:13px">
                      ${f.loading ? "Отправка..." : f.forgotSent ? "Отправлено ✓" : "Отправить ссылку"}
                    </button>
                    <div style="text-align:center;margin-top:16px">
                      <button onclick="app.setAuthTab('login')" style="background:none;border:none;color:var(--muted);font-size:12px;cursor:pointer;text-decoration:underline">← Вернуться ко входу</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }

        /* ── Login / Register form ── */
        const isRegister = _authTab === "register";
        const canSubmit = !f.loading && (!isRegister || f.consent);
        return `
          <div class="auth-gate">
            <div class="auth-gate-inner">
              ${landingLeft}
              <div class="auth-gate-right">
                <div class="auth-gate-box">
                  <div class="auth-gate-logo">
                    <div class="logo" style="width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,var(--primary),var(--blue));display:grid;place-items:center">
                      <img src="logo-icon.svg" alt="A" onerror="this.style.display='none'" style="width:24px;height:24px;object-fit:contain">
                    </div>
                    <div>
                      <div style="font-weight:900;font-size:15px">ADERVIS CRM</div>
                      <div style="font-size:11px;color:var(--muted)">CRM для видеопродакшна</div>
                    </div>
                  </div>

                  <div class="auth-tab-bar">
                    <button class="auth-tab ${!isRegister ? "active" : ""}" onclick="app.setAuthTab('login')">Вход</button>
                    <button class="auth-tab ${isRegister ? "active" : ""}" onclick="app.setAuthTab('register')">Регистрация</button>
                  </div>

                  ${f.error ? `<div style="background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);border-radius:10px;padding:10px 14px;color:var(--red);font-size:13px;margin-bottom:14px">${escapeHtml(f.error)}</div>` : ""}

                  ${isRegister ? `
                  <div class="field" style="margin-bottom:12px"><label>Имя</label>
                    <input placeholder="Ваше имя" value="${escapeHtml(f.name)}" oninput="app.setAuthField('name',this.value)" onkeydown="if(event.key==='Enter')app.authSubmit()">
                  </div>
                  <div class="field" style="margin-bottom:12px">
                    <label style="display:flex;align-items:center;gap:6px">Код приглашения <span style="font-size:10px;color:var(--muted);font-weight:normal">(если вас пригласили в команду)</span></label>
                    <input placeholder="Вставьте код от руководителя (необязательно)" value="${escapeHtml(f.inviteCode||"")}" oninput="app.setAuthField('inviteCode',this.value)" style="font-family:monospace;font-size:12px">
                  </div>` : ""}

                  <div class="field" style="margin-bottom:12px"><label>Email</label>
                    <input type="email" placeholder="you@example.com" value="${escapeHtml(f.email)}" oninput="app.setAuthField('email',this.value)" onkeydown="if(event.key==='Enter')app.authSubmit()"></div>

                  <div class="field" style="margin-bottom:${isRegister ? "12px" : "14px"}"><label>Пароль</label>
                    <div style="position:relative">
                      <input type="${f.showPassword ? "text" : "password"}" placeholder="••••••••" value="${escapeHtml(f.password)}" oninput="app.setAuthField('password',this.value)" onkeydown="if(event.key==='Enter')app.authSubmit()" style="padding-right:44px;width:100%">
                      <button type="button" onclick="app.toggleAuthPasswordVisibility()" title="${f.showPassword ? "Скрыть пароль" : "Показать пароль"}" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);font-size:15px;cursor:pointer;padding:4px;line-height:1">${f.showPassword ? "🙈" : "👁"}</button>
                    </div>
                  </div>

                  ${!isRegister ? `
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
                    <input type="checkbox" id="auth-remember-me" ${f.rememberMe ? "checked" : ""} onchange="app.setAuthField('rememberMe',this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary)">
                    <label for="auth-remember-me" style="font-size:13px;color:var(--muted);cursor:pointer;margin:0;user-select:none">Запомнить меня</label>
                  </div>` : `
                  <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:16px;padding:10px 12px;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.2);border-radius:10px">
                    <input type="checkbox" id="auth-consent" ${f.consent ? "checked" : ""} onchange="app.setAuthField('consent',this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);margin-top:1px;flex-shrink:0">
                    <label for="auth-consent" style="font-size:12px;color:var(--muted);cursor:pointer;margin:0;user-select:none;line-height:1.5">Я принимаю <a href="https://adervis.ru/docs" target="_blank" rel="noopener" style="color:var(--primary2)">Оферту и Политику конфиденциальности</a></label>
                  </div>`}

                  <button class="btn primary full" onclick="app.authSubmit()" ${canSubmit ? "" : "disabled"} style="width:100%;padding:13px;${!canSubmit && isRegister ? "opacity:.5;cursor:not-allowed" : ""}">
                    ${f.loading ? "Подождите..." : !isRegister ? "Войти" : "Зарегистрироваться"}
                  </button>

                  ${!isRegister ? `
                  <div style="text-align:center;margin-top:16px">
                    <button onclick="app.setAuthTab('forgot')" style="background:none;border:none;color:var(--muted);font-size:12px;cursor:pointer;text-decoration:underline">Забыли пароль?</button>
                  </div>` : ""}

                  <div class="oauth-divider"><span>или войти через</span></div>
                  <div class="oauth-buttons" style="grid-template-columns:1fr">
                    <button class="oauth-btn oauth-active oauth-google-full" onclick="app.oauthSignIn('google')" title="Войти через Google">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      <span style="font-size:13px">Продолжить с Google</span>
                    </button>
                  </div>
                  ${(localStorage.getItem('vk_app_id') || _DEFAULT_VK_APP_ID) ? `<div id="vkid-one-tap" style="margin-top:8px"></div>` : ''}

                  <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line);text-align:center;font-size:11px;color:var(--muted)">
                    Adervis · ИНН 592110786536 ·
                    <a href="mailto:adervis.digital@gmail.com" style="color:var(--muted)">adervis.digital@gmail.com</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      function setAuthTab(tab) {
        _authTab = ["login","register","forgot"].includes(tab) ? tab : "login";
        _authFields.error = "";
        _authFields.forgotSent = false;
        renderAuthGateEl();
      }

      function setAuthField(key, val) {
        _authFields[key] = val;
        if (key === "rememberMe" || key === "showPassword" || key === "consent") renderAuthGateEl();
      }

      function toggleAuthPasswordVisibility() {
        _authFields.showPassword = !_authFields.showPassword;
        renderAuthGateEl();
      }

      async function authSubmit() {
        const f = _authFields;
        if (!f.email || !f.password) { f.error = "Введите email и пароль"; renderAuthGateEl(); return; }
        if (!_supabase) { f.error = "Supabase не настроен — настройте в разделе Настройки"; renderAuthGateEl(); return; }
        if (_authTab === "register" && !f.consent) { f.error = "Необходимо принять Оферту и Политику конфиденциальности"; renderAuthGateEl(); return; }
        f.loading = true; f.error = ""; renderAuthGateEl();

        if (_authTab === "register") {
          if ((f.inviteCode || "").trim()) _pendingInviteCode = f.inviteCode.trim();
          const { data: signUpData, error } = await _supabase.auth.signUp({ email: f.email, password: f.password,
            options: { data: { name: f.name } } });
          f.loading = false;
          if (error) { f.error = error.message; _pendingInviteCode = ""; renderAuthGateEl(); return; }
          trackGoal("registration");
          if (!signUpData.session) {
            _authFields = { email: f.email, password: "", name: "", inviteCode: "", error: `📧 Письмо отправлено на ${f.email}. Перейдите по ссылке в письме для активации, затем войдите здесь.`, loading: false, showPassword: false, rememberMe: true, consent: false, forgotSent: false };
            _authTab = "login"; renderAuthGateEl(); return;
          }
          f.error = ""; _authFields = { email: "", password: "", name: "", inviteCode: "", error: "✅ Аккаунт создан! Войдите ниже.", loading: false, showPassword: false, rememberMe: true, consent: false, forgotSent: false };
          _authTab = "login"; renderAuthGateEl();
        } else {
          const rememberMe = f.rememberMe;
          const { error } = await _supabase.auth.signInWithPassword({ email: f.email, password: f.password });
          f.loading = false;
          if (error) { f.error = error.message === "Invalid login credentials" ? "Неверный email или пароль" : error.message; renderAuthGateEl(); return; }
          if (!rememberMe) {
            window.addEventListener("beforeunload", () => { _supabase && _supabase.auth.signOut(); }, { once: true });
          }
        }
      }

      async function forgotPasswordSubmit() {
        const f = _authFields;
        if (!f.email) { f.error = "Введите email"; renderAuthGateEl(); return; }
        if (!_supabase) { f.error = "Supabase не настроен"; renderAuthGateEl(); return; }
        f.loading = true; f.error = ""; renderAuthGateEl();
        const { error } = await _supabase.auth.resetPasswordForEmail(f.email);
        f.loading = false;
        if (error) { f.error = error.message; renderAuthGateEl(); return; }
        f.forgotSent = true;
        renderAuthGateEl();
      }

      async function oauthSignIn(provider) {
        if (!_supabase) {
          _authFields.error = "Supabase не настроен — настройте в разделе Настройки";
          renderAuthGateEl(); return;
        }
        const { error } = await _supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: location.origin + location.pathname }
        });
        if (error) { _authFields.error = error.message; renderAuthGateEl(); }
      }

      let _vkidInited = false;

      function initVKIDWidget() {
        const sdk = window.VKIDSDK;
        if (!sdk || _vkidInited) return;
        const appId = (localStorage.getItem('vk_app_id') || _DEFAULT_VK_APP_ID) || '';
        if (!appId) return;
        const container = document.getElementById('vkid-one-tap');
        if (!container) return;
        _vkidInited = true;

        try {
          sdk.Config.init({
            app:          Number(appId),
            redirectUrl:  location.origin + location.pathname,
            responseMode: sdk.ConfigResponseMode.Callback,
            source:       sdk.ConfigSource.LOWCODE,
            scope:        'email',
          });

          const oneTap = new sdk.OneTap();
          oneTap.render({ container, showAlternativeLogin: true })
            .on(sdk.WidgetEvents.ERROR, (err) => {
              console.warn('VK ID widget error (non-critical):', err);
            })
            .on(sdk.OneTapInternalEvents.LOGIN_SUCCESS, async (payload) => {
              await handleVKIDSuccess(payload.code, payload.device_id);
            });
        } catch(e) {
          _vkidInited = false;
          console.error('VK ID init error:', e);
        }
      }

      async function handleVKIDSuccess(code, deviceId) {
        const sdk = window.VKIDSDK;
        if (!sdk) return;
        _authFields.loading = true;
        _authFields.error = '';
        renderAuthGateEl();

        try {
          const tokenData = await sdk.Auth.exchangeCode(code, deviceId);
          if (!tokenData?.id_token) throw new Error('VK не вернул id_token');

          const { url: sbUrl, key } = getSupabaseConfig();
          const res = await fetch(`${sbUrl}/functions/v1/vk-auth`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': key },
            body:    JSON.stringify({ id_token: tokenData.id_token }),
          });
          const result = await res.json();
          _authFields.loading = false;

          if (result.error) {
            _authFields.error = 'VK: ' + result.error;
            renderAuthGateEl(); return;
          }

          if (!_supabase) {
            _authFields.error = 'Supabase не инициализирован';
            renderAuthGateEl(); return;
          }

          const { error: otpErr } = await _supabase.auth.verifyOtp({
            token_hash: result.token,
            type: 'magiclink',
          });

          if (otpErr) {
            _authFields.error = 'VK вход: ' + otpErr.message;
            renderAuthGateEl();
          }
          // onAuthStateChange обработает успешный вход
        } catch(e) {
          _authFields.loading = false;
          _authFields.error = 'VK Auth: ' + (e?.message || 'Ошибка');
          renderAuthGateEl();
        }
      }

      function checkVKCallback() { /* stub — VK ID SDK работает без редиректа */ }

      function exitLocalModeAndLogin() {
        localStorage.removeItem("adervis_local_mode");
        renderAuthGateEl();
        render();
      }

      function useLocalMode() {
        localStorage.setItem("adervis_local_mode", "1");
        renderAuthGateEl();
        render();
      }

      /* ─── USER LOCAL SETTINGS (name, avatar per user) ─── */
      function getUserSettings() {
        const uid = _adminSession && _adminSession.user.id;
        if (!uid) return { displayName: "", avatarDataUrl: "" };
        try { return JSON.parse(localStorage.getItem("adervis_us_" + uid) || "{}"); }
        catch { return {}; }
      }
      function saveUserSettings(patch) {
        const uid = _adminSession && _adminSession.user.id;
        if (!uid) return;
        const cur = getUserSettings();
        localStorage.setItem("adervis_us_" + uid, JSON.stringify({ ...cur, ...patch }));
      }

      /* ─── PROFILE DROPDOWN ─── */
      let _profileDdOpen = false;
      function toggleProfileDd(force) {
        _profileDdOpen = force !== undefined ? force : !_profileDdOpen;
        renderProfileDd();
        if (_profileDdOpen) {
          setTimeout(() => document.addEventListener("click", _closeProfileDd, { once: true }), 10);
        }
      }
      function _closeProfileDd() { _profileDdOpen = false; renderProfileDd(); }
      function renderProfileDd() {
        const el = document.getElementById("profileDd");
        if (!el) return;
        el.classList.toggle("open", _profileDdOpen);
        if (!_profileDdOpen) { el.innerHTML = ""; return; }
        const email = _adminSession ? _adminSession.user.email : "";
        const subLabel = getSubscriptionLabel();
        const us = getUserSettings();
        const avatarHtml = us.avatarDataUrl
          ? `<img src="${us.avatarDataUrl}" alt="">`
          : `<span style="font-size:15px;font-weight:900">${(email||"A")[0].toUpperCase()}</span>`;
        const active = isSubscriptionActive();
        const localMode = !_adminSession;
        el.innerHTML = `
          ${localMode ? `
            <div style="padding:14px 16px">
              <div style="font-size:13px;font-weight:750;margin-bottom:10px">Локальный режим</div>
              <button class="pd-item" style="padding:9px 0;width:100%;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--blue));color:#fff;justify-content:center" onclick="app.exitLocalModeAndLogin();app.toggleProfileDd(false)">🔐 Войти / Зарегистрироваться</button>
            </div>
          ` : `
            <div class="pd-head">
              <div class="pd-avatar">${avatarHtml}</div>
              <div style="min-width:0">
                <div class="pd-email" title="${escapeHtml(email)}">${escapeHtml(email)}</div>
                <div class="pd-sub" style="${!active ? "color:var(--red)" : ""}">${escapeHtml(subLabel || "Активна")}</div>
              </div>
            </div>
            <div class="pd-sep"></div>
            <button class="pd-item" onclick="app.go('profile');app.toggleProfileDd(false)" title="Ваш аккаунт, аватар, смена пароля"><span class="pd-item-icon">👤</span>Мой профиль</button>
            <button class="pd-item" onclick="app.go('settings');app.toggleProfileDd(false)" title="Supabase, тема, экспорт данных"><span class="pd-item-icon">⚙️</span>Настройки</button>
            <button class="pd-item" onclick="app.go('support');app.toggleProfileDd(false)" title="Контакты и поддержка"><span class="pd-item-icon">💬</span>Поддержка</button>
            <button class="pd-item" style="background:rgba(124,58,237,.08);border-radius:10px" onclick="app.gotoSubscription();app.toggleProfileDd(false)" title="Тарифы, оплата, история платежей">
              <span class="pd-item-icon">💳</span>
              <span style="flex:1">Тарифный план</span>
              <span style="font-size:10px;background:${active?"rgba(22,163,74,.18)":"rgba(220,38,38,.18)"};color:${active?"var(--green)":"var(--red)"};border-radius:99px;padding:2px 8px;font-weight:750">${escapeHtml(subLabel||"Активен")}</span>
            </button>
            <div class="pd-sep"></div>
            <button class="pd-item danger" onclick="app.adminLogout();app.toggleProfileDd(false)" title="Выход из аккаунта"><span class="pd-item-icon">→</span>Выйти</button>
          `}
        `;
      }

      /* ─── HELP DROPDOWN ─── */
      let _helpDdOpen = false;
      function toggleHelpDd(force) {
        _helpDdOpen = force !== undefined ? force : !_helpDdOpen;
        renderHelpDd();
        if (_helpDdOpen) {
          setTimeout(() => document.addEventListener("click", _closeHelpDd, { once: true }), 10);
        }
      }
      function _closeHelpDd() { _helpDdOpen = false; renderHelpDd(); }
      function renderHelpDd() {
        const el = document.getElementById("helpDd");
        if (!el) return;
        el.classList.toggle("open", _helpDdOpen);
        if (!_helpDdOpen) { el.innerHTML = ""; return; }
        const seen = localStorage.getItem("adervis_onboarded") === "1";
        el.innerHTML = `
          <div style="padding:6px 0">
            <div class="help-dd-section">Знакомство</div>
            <button class="help-dd-item" onclick="app.openHelpModal();app.toggleHelpDd(false)">
              <span class="help-dd-item-icon" style="background:rgba(124,58,237,.15)">✨</span>
              <div><div>Начало работы</div>${seen ? `<div class="hdi-sub" style="color:var(--green)">Завершено ✓</div>` : `<div class="hdi-sub">Быстрый старт</div>`}</div>
            </button>
            <button class="help-dd-item" onclick="app.go('knowledge');app.toggleHelpDd(false)">
              <span class="help-dd-item-icon" style="background:rgba(37,99,235,.15)">📚</span>
              <div><div>Руководство</div><div class="hdi-sub">База знаний</div></div>
            </button>
            <div class="pd-sep" style="margin:6px 0"></div>
            <div class="help-dd-section">Обновления</div>
            <a class="help-dd-item" href="https://t.me/adervisdigital" target="_blank" rel="noopener" onclick="app.toggleHelpDd(false)">
              <span class="help-dd-item-icon" style="background:rgba(8,145,178,.15)">✈️</span>
              <div><div>Telegram канал</div><div class="hdi-sub">Новости и обновления</div></div>
            </a>
            <div class="pd-sep" style="margin:6px 0"></div>
            <div class="help-dd-section">Получить помощь</div>
            <a class="help-dd-item" href="mailto:adervis.digital@gmail.com?subject=Помощь по ADERVIS CRM" onclick="app.toggleHelpDd(false)">
              <span class="help-dd-item-icon" style="background:rgba(22,163,74,.15)">💬</span>
              <div><div>Написать нам</div><div class="hdi-sub">adervis.digital@gmail.com</div></div>
            </a>
            <button class="help-dd-item" onclick="app.go('knowledge');app.toggleHelpDd(false)">
              <span class="help-dd-item-icon" style="background:rgba(202,138,4,.15)">🎥</span>
              <div><div>Записаться на демо</div><div class="hdi-sub">Онлайн-показ для вас</div></div>
            </button>
          </div>
        `;
      }

      /* ─── CURRENCY DROPDOWN ─── */
      const CURRENCIES = [
        { sym: "₽", code: "₽", label: "Российский рубль" },
        { sym: "Br", code: "Br", label: "Белорусский рубль" },
        { sym: "₸", code: "₸", label: "Казахстанский тенге" },
        { sym: "с", code: "с", label: "Кыргызский сом" },
        { sym: "$", code: "$", label: "Доллар США" },
        { sym: "€", code: "€", label: "Евро" },
        { sym: "£", code: "£", label: "Фунт стерлингов" },
      ];
      let _currencyDdOpen = false;
      function toggleCurrencyDd() {
        _currencyDdOpen = !_currencyDdOpen;
        const el = document.getElementById("currencyDd");
        if (el) el.classList.toggle("open", _currencyDdOpen);
        if (_currencyDdOpen) setTimeout(() => document.addEventListener("click", _closeCurrencyDd, { once: true }), 10);
      }
      function _closeCurrencyDd() { _currencyDdOpen = false; const el = document.getElementById("currencyDd"); if (el) el.classList.remove("open"); }
      function selectCurrency(code) {
        state.project.currency = code;
        save();
        _currencyDdOpen = false;
        render();
      }

      /* ─── UPDATE PROJECT DEADLINE FROM CARD ─── */
      function updateProjectDeadlineCard(projectId, value) {
        const proj = state.savedProjects.find(p => p.id === projectId);
        if (!proj) return;
        proj.deadline = value;
        if (proj.snapshot && proj.snapshot.project) proj.snapshot.project.deadline = value;
        save();
        render();
      }

      /* ─── USER AVATAR UPLOAD (resizes to 80px, syncs to Supabase) ─── */
      function uploadUserAvatar(event) {
        const file = event.target && event.target.files && event.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = () => {
          // Resize to 80×80 via canvas before storing
          const img = new Image();
          img.onload = () => {
            const SIZE = 80;
            const canvas = document.createElement("canvas");
            canvas.width = SIZE; canvas.height = SIZE;
            const ctx = canvas.getContext("2d");
            const side = Math.min(img.width, img.height);
            const ox = (img.width - side) / 2, oy = (img.height - side) / 2;
            ctx.drawImage(img, ox, oy, side, side, 0, 0, SIZE, SIZE);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            saveUserSettings({ avatarDataUrl: dataUrl });
            _syncAvatarToCloud(dataUrl);
            render();
            toast("Фото профиля обновлено");
          };
          img.src = String(reader.result || "");
        };
        reader.readAsDataURL(file);
      }
      function removeUserAvatar() {
        saveUserSettings({ avatarDataUrl: "" });
        _syncAvatarToCloud("");
        render();
        toast("Фото удалено");
      }
      async function _syncAvatarToCloud(dataUrl) {
        if (!_supabase || !_adminSession) return;
        try {
          await _supabase.from("profiles").update({ avatar_url: dataUrl || null }).eq("id", _adminSession.user.id);
        } catch(e) { console.warn("Avatar sync:", e); }
      }

      /* ─── GLOBAL SEARCH ─── */
      function openSearch() {
        const m = document.getElementById("searchModal");
        if (m) { m.style.display = "flex"; setTimeout(() => { const i = document.getElementById("searchInput"); if(i){i.value="";i.focus();} runSearch(""); }, 10); }
      }
      function closeSearch() {
        const m = document.getElementById("searchModal");
        if (m) m.style.display = "none";
      }
      function runSearch(q) {
        const el = document.getElementById("searchResults");
        if (!el) return;
        q = (q || "").toLowerCase().trim();
        if (!q) {
          el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">Начните вводить — ищем по сделкам, клиентам и задачам</div>`;
          return;
        }
        const results = [];
        (state.savedProjects || []).forEach(p => {
          if ((p.name||"").toLowerCase().includes(q) || (p.client||"").toLowerCase().includes(q)) {
            results.push({ type: "deal", icon: "📋", color: "rgba(124,58,237,.15)", name: p.name || "Без названия", sub: `${p.client||""} · ${money(p.total||0)} · ${p.crmStatus||"Лид"}`, action: `app.openDeal('${p.id}');app.closeSearch()` });
          }
        });
        (state.clients || []).forEach(c => {
          if ((c.name||"").toLowerCase().includes(q) || (c.company||"").toLowerCase().includes(q) || (c.phone||"").includes(q)) {
            results.push({ type: "client", icon: "👤", color: "rgba(37,99,235,.15)", name: c.name || "Клиент", sub: `${c.company||""} · ${c.phone||""}`, action: `app.go('clients');app.closeSearch()` });
          }
        });
        (state.tasks || []).forEach(t => {
          if ((t.title||"").toLowerCase().includes(q)) {
            results.push({ type: "task", icon: "✅", color: "rgba(8,145,178,.15)", name: t.title, sub: `${t.status||""} · ${t.deadline ? formatDate(t.deadline) : "без срока"}`, action: `app.go('deal');app.setDealView('tasks');app.closeSearch()` });
          }
        });
        if (!results.length) { el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">Ничего не найдено по «${escapeHtml(q)}»</div>`; return; }
        el.innerHTML = results.slice(0,12).map(r => `
          <div class="search-result" onclick="${r.action}">
            <div class="search-result-icon" style="background:${r.color}">${r.icon}</div>
            <div><div class="search-result-name">${escapeHtml(r.name)}</div><div class="search-result-sub">${escapeHtml(r.sub)}</div></div>
          </div>`).join("");
      }

      /* ─── DUPLICATE DEAL ─── */
      function duplicateDeal(projectId) {
        const proj = state.savedProjects.find(p => p.id === projectId);
        if (!proj) return;
        const copy = deepClone(proj);
        copy.id = uid("proj");
        copy.name = (proj.name || "Проект") + " (копия)";
        copy.crmStatus = "Лид";
        copy.createdAt = new Date().toISOString();
        if (copy.snapshot && copy.snapshot.project) {
          copy.snapshot.project.name = copy.name;
          copy.snapshot.project.crmStatus = "Лид";
        }
        state.savedProjects.unshift(copy);
        save(); render();
        toast("✅ Сделка продублирована: " + copy.name);
      }

      function _saveUserField(key, value) {
        saveUserSettings({ [key]: value });
        // Update avatar in topbar without full re-render
        if (key === "displayName") {
          const paBtn = document.getElementById("profileAvatarBtn");
          const paInner = document.getElementById("profileAvatarInner");
          if (paInner && !getUserSettings().avatarDataUrl) {
            const email = _adminSession ? _adminSession.user.email : "";
            const n = (value || email || "A")[0].toUpperCase();
            paInner.textContent = n;
          }
        }
      }

      function renderAuthGateEl() {
        const el = document.getElementById("authGateContainer");
        if (!el) return;
        if (_briefAgencyId || _portalId) { el.innerHTML = ""; return; }
        const cfg = getSupabaseConfig();
        const localMode = localStorage.getItem("adervis_local_mode") === "1";
        // Пока проверяем сохранённую сессию — auth gate не показываем (бесшовная загрузка)
        if (_authChecking || !cfg.url || !cfg.key || localMode || _adminSession) {
          el.innerHTML = "";
        } else {
          el.innerHTML = renderAuthGate();
          _vkidInited = false;
          setTimeout(initVKIDWidget, 50);
        }
      }

      function _promoCodeInputHtml() {
        const promoValid   = _promoState && typeof _promoState === "object";
        const promoInvalid = _promoState === "invalid";
        const promoChecking = _promoState === "checking";
        const borderColor = promoValid ? "var(--green)" : promoInvalid ? "var(--red)" : "var(--line)";
        const statusHtml = promoValid
          ? `<span style="color:var(--green);font-size:12px;font-weight:600">✓ −${_promoState.discount}% применено</span>`
          : promoInvalid
            ? `<span style="color:var(--red);font-size:12px">Промокод не найден или истёк</span>`
            : promoChecking
              ? `<span style="color:var(--muted);font-size:12px">Проверяем...</span>`
              : "";
        return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:0;border:1px solid ${borderColor};border-radius:8px;overflow:hidden;background:var(--input);transition:.15s">
              <input
                type="text"
                placeholder="Промокод"
                value="${escapeHtml(_promoCode)}"
                maxlength="32"
                style="border:none;background:transparent;padding:9px 12px;font-size:13px;color:var(--text);width:160px;outline:none"
                oninput="app._promoInput(this.value)"
                onkeydown="if(event.key==='Enter')app.validatePromo()"
              >
              ${promoValid
                ? `<button onclick="app.clearPromo()" style="border:none;background:transparent;color:var(--muted);padding:9px 10px;cursor:pointer;font-size:16px" title="Убрать промокод">✕</button>`
                : `<button onclick="app.validatePromo()" style="border:none;background:var(--primary);color:#fff;padding:9px 14px;cursor:pointer;font-size:13px;font-weight:600" ${promoChecking ? "disabled" : ""}>${promoChecking ? "..." : "→"}</button>`
              }
            </div>
            ${statusHtml}
          </div>`;
      }

      function renderSubscriptionGate() {
        const email = _adminSession && _adminSession.user.email || "";
        const hasSupabase = !!getSupabaseConfig().url;
        const paidPlans = PLANS.filter(p => p.price > 0);
        const promoValid = _promoState && typeof _promoState === "object";
        const promoInvalid = _promoState === "invalid";
        const promoChecking = _promoState === "checking";
        return `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;text-align:center;padding:32px 16px">
            <div style="font-size:48px;margin-bottom:18px">🔒</div>
            <h1 style="font-size:26px;margin-bottom:10px">Подписка истекла</h1>
            <p style="max-width:420px;margin-bottom:8px;line-height:1.55;color:var(--muted)">
              Аккаунт <strong style="color:var(--text)">${escapeHtml(email)}</strong> — выберите тариф для продолжения работы.
            </p>
            <p style="max-width:420px;margin-bottom:28px;font-size:12px;color:var(--green)">
              ✅ Все ваши сделки, клиенты и сметы сохранены — после оплаты вы продолжите с того же места
            </p>
            ${hasSupabase ? `
              <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:640px;margin-bottom:24px">
                ${paidPlans.map(p => {
                  const isLoading = _buyingPlan === p.id;
                  const discountedPrice = promoValid ? Math.round(p.price * (1 - _promoState.discount / 100)) : null;
                  return `
                    <div style="background:var(--panel2);border:1px solid ${p.popular ? "var(--primary)" : "var(--line)"};border-radius:16px;padding:18px 22px;min-width:140px;flex:1;max-width:180px;position:relative">
                      ${p.popular ? `<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:2px 10px">Популярный</div>` : ""}
                      <div style="font-size:13px;font-weight:700;margin-bottom:6px">${p.label}</div>
                      ${discountedPrice !== null
                        ? `<div style="font-size:14px;color:var(--muted);text-decoration:line-through;line-height:1">${p.price}₽</div><div style="font-size:22px;font-weight:900;color:var(--green);margin-bottom:2px">${discountedPrice}₽</div>`
                        : `<div style="font-size:22px;font-weight:900;margin-bottom:2px">${p.price}₽</div>`}
                      <div style="font-size:10px;color:var(--muted);margin-bottom:10px">${p.period}</div>
                      ${p.save ? `<div style="font-size:10px;color:var(--green);margin-bottom:8px">${p.save}</div>` : ""}
                      <button class="btn primary" style="width:100%;padding:9px;font-size:13px" onclick="app.buyPlan('${p.id}')" ${isLoading ? "disabled" : ""}>
                        ${isLoading ? "⏳..." : "Оплатить →"}
                      </button>
                    </div>`;
                }).join("")}
              </div>
              ${_promoCodeInputHtml()}
              <p style="font-size:12px;color:var(--muted);margin-bottom:20px">Безопасная оплата через ЮKassa · карта / СБП / ЮМани</p>
            ` : `
              <a href="mailto:adervis.digital@gmail.com?subject=Продление подписки ADERVIS CRM" class="btn primary" style="text-decoration:none;margin-bottom:20px">
                📧 Продлить по email
              </a>
            `}
            <button class="btn small" onclick="app.adminLogout()">Выйти</button>
          </div>
        `;
      }

      function renderPayBanner() {
        if (!_adminSession || !_userProfile) return "";
        const sub = _userProfile;
        const s = sub.subscription_status;
        if (s === "active" && sub.subscription_expires_at) {
          const daysLeft = Math.round((new Date(sub.subscription_expires_at) - new Date()) / 86400000);
          if (daysLeft > 7) return "";
          return `
            <div id="payBannerBar" style="position:fixed;bottom:70px;right:16px;z-index:200;background:var(--primary);color:#fff;border-radius:14px;padding:10px 16px;box-shadow:0 8px 28px rgba(124,58,237,.45);display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;cursor:pointer" onclick="app.gotoSubscription()" title="Продлите подписку">
              ⚡ ${daysLeft <= 0 ? "Истекает сегодня" : `Осталось ${daysLeft} дн.`} — Продлить
            </div>`;
        }
        return "";
      }

      /* ═══════════════════════════════════════════════════════
         УВЕДОМЛЕНИЯ
      ═══════════════════════════════════════════════════════ */
      function pushNotification(type, title, body, projectId) {
        const n = { id: uid("notif"), type, title, body: body || "", projectId: projectId || "", read: false, createdAt: new Date().toISOString() };
        state.notifications = [n, ...(state.notifications || [])].slice(0, 100);
        renderNotifBadge();
      }

      function renderNotifBadge() {
        const badge = document.getElementById("notifBadge");
        if (!badge) return;
        const unread = (state.notifications || []).filter(n => !n.read).length;
        badge.textContent = unread > 9 ? "9+" : String(unread);
        badge.style.display = unread > 0 ? "flex" : "none";
      }

      function toggleNotifPopup() {
        state.notifPopupOpen = !state.notifPopupOpen;
        if (state.notifPopupOpen) {
          // Mark all as read
          (state.notifications || []).forEach(n => n.read = true);
          renderNotifBadge();
          save();
        }
        const el = document.getElementById("notifPopupContainer");
        if (!el) return;
        el.innerHTML = state.notifPopupOpen ? renderNotifPopup() : "";
        if (state.notifPopupOpen) {
          // close on outside click
          setTimeout(() => document.addEventListener("click", _closeNotifOnOutside, { once: true }), 10);
        }
      }

      function _closeNotifOnOutside(e) {
        if (!e.target.closest("#notifPopupContainer") && !e.target.closest("#notifBtn")) {
          state.notifPopupOpen = false;
          const el = document.getElementById("notifPopupContainer");
          if (el) el.innerHTML = "";
        }
      }

      function renderNotifPopup() {
        const notifs = state.notifications || [];
        const timeAgo = iso => {
          const d = Math.floor((Date.now() - new Date(iso)) / 1000);
          if (d < 60) return "только что";
          if (d < 3600) return Math.floor(d/60) + " мин назад";
          if (d < 86400) return Math.floor(d/3600) + " ч назад";
          return Math.floor(d/86400) + " дн назад";
        };
        return `
          <div class="notif-popup" id="notifPopup">
            <div class="notif-popup-header">
              <strong>Уведомления</strong>
              <div style="display:flex;gap:8px;align-items:center">
                ${notifs.length ? `<button style="background:none;border:none;font-size:11px;color:var(--muted);cursor:pointer" onclick="app.clearNotifs()">Очистить</button>` : ""}
                <button onclick="app.toggleNotifPopup()" style="background:none;border:none;font-size:20px;color:var(--muted);cursor:pointer;line-height:1;padding:0 2px">×</button>
              </div>
            </div>
            <div class="notif-list">
              ${notifs.length === 0 ? `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Нет уведомлений</div>` :
                notifs.map(n => `
                  <div class="notif-item ${n.read ? "" : "unread"}" onclick="app.notifClick('${n.id}')">
                    <div class="notif-dot"></div>
                    <div class="notif-body">
                      <strong>${escapeHtml(n.title)}</strong>
                      ${n.body ? escapeHtml(n.body) : ""}
                      <div class="notif-time">${timeAgo(n.createdAt)}</div>
                    </div>
                  </div>`).join("")
              }
            </div>
          </div>
        `;
      }

      function clearNotifs() {
        state.notifications = [];
        state.notifPopupOpen = false;
        const el = document.getElementById("notifPopupContainer");
        if (el) el.innerHTML = "";
        renderNotifBadge();
        save();
      }

      function notifClick(id) {
        const n = (state.notifications || []).find(x => x.id === id);
        if (n && n.projectId) { app.go("deal"); }
        toggleNotifPopup();
      }

      /* ═══════════════════════════════════════════════════════
         ПРОФИЛЬ И ТАРИФЫ
      ═══════════════════════════════════════════════════════ */
      const PLANS = [
        { id: "trial",  label: "Пробный",    price: 0,   period: "14 дней бесплатно", save: "",             months: 0,  maxUsers: 1 },
        { id: "month1", label: "Месяц",       price: 890, period: "в месяц",            save: "",             months: 1,  maxUsers: 1 },
        { id: "month3", label: "3 месяца",    price: 740, period: "в месяц",            save: "Экономия 17%", months: 3,  maxUsers: 3, popular: true },
        { id: "month6", label: "6 месяцев",   price: 640, period: "в месяц",            save: "Экономия 28%", months: 6,  maxUsers: 5 },
        { id: "year",   label: "Год",         price: 520, period: "в месяц",            save: "Экономия 42%", months: 12, maxUsers: 10 }
      ];

      function renderSupport() {
        return `
          <div class="panel" style="max-width:680px;margin:0 auto">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px">
              <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--primary),var(--blue));display:grid;place-items:center;flex-shrink:0">
                <img src="logo-icon.svg" alt="A" onerror="this.style.display='none'" style="width:32px;height:32px;object-fit:contain">
              </div>
              <div>
                <h1 style="margin:0;font-size:20px">Поддержка и контакты</h1>
                <div style="font-size:13px;color:var(--muted)">ADERVIS CRM · CRM для видеопродакшна</div>
              </div>
            </div>

            <div style="display:grid;gap:14px;margin-bottom:28px">
              <a href="mailto:adervis.digital@gmail.com" class="support-card" style="text-decoration:none">
                <div class="support-card-icon" style="background:rgba(37,99,235,.12);color:var(--blue)">✉</div>
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text)">Email-поддержка</div>
                  <div style="font-size:13px;color:var(--muted)">adervis.digital@gmail.com</div>
                  <div style="font-size:12px;color:var(--muted);margin-top:3px">Ответим в течение 24 часов</div>
                </div>
              </a>

              <a href="https://t.me/adervisdigital" target="_blank" rel="noopener" class="support-card" style="text-decoration:none">
                <div class="support-card-icon" style="background:rgba(0,136,204,.12);color:#29b6f6">▶</div>
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text)">Telegram</div>
                  <div style="font-size:13px;color:var(--muted)">@adervisdigital</div>
                  <div style="font-size:12px;color:var(--muted);margin-top:3px">Быстрые вопросы и обновления</div>
                </div>
              </a>

              <a href="https://adervis.ru/docs" target="_blank" rel="noopener" class="support-card" style="text-decoration:none">
                <div class="support-card-icon" style="background:rgba(22,163,74,.12);color:var(--green)">📄</div>
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text)">Документы</div>
                  <div style="font-size:13px;color:var(--muted)">Оферта и Политика конфиденциальности</div>
                  <div style="font-size:12px;color:var(--muted);margin-top:3px">adervis.ru/docs</div>
                </div>
              </a>

              <button class="support-card" onclick="app.openHelpModal()" style="border:none;cursor:pointer;text-align:left;width:100%">
                <div class="support-card-icon" style="background:rgba(124,58,237,.12);color:var(--primary)">✨</div>
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text)">Помощь и обучение</div>
                  <div style="font-size:13px;color:var(--muted)">Быстрый старт — как начать работать в CRM</div>
                  <div style="font-size:12px;color:var(--muted);margin-top:3px">Онбординг, подсказки, видео-инструкции</div>
                </div>
              </button>

              <a href="mailto:adervis.digital@gmail.com?subject=${encodeURIComponent('Отзыв о ADERVIS CRM')}&body=${encodeURIComponent('Привет! Делюсь впечатлением от продукта:\n\n[напишите пару предложений — что понравилось, что помогло в работе]\n\nМожно указать моё имя и компанию рядом с отзывом на сайте? (да/нет)')}" class="support-card" style="text-decoration:none">
                <div class="support-card-icon" style="background:rgba(246,189,58,.14);color:var(--yellow)">⭐</div>
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text)">Оставить отзыв о продукте</div>
                  <div style="font-size:13px;color:var(--muted)">Поделитесь впечатлением — поможет нам стать лучше</div>
                  <div style="font-size:12px;color:var(--muted);margin-top:3px">Лучшие отзывы (с вашего согласия) опубликуем на сайте</div>
                </div>
              </a>
            </div>

            <div class="panel" style="background:var(--panel2);border:none;box-shadow:none">
              <h3 style="margin:0 0 14px;font-size:15px">Реквизиты</h3>
              <div style="display:grid;gap:8px;font-size:13px">
                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
                  <span style="color:var(--muted)">Организация</span>
                  <span>Самозанятый</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
                  <span style="color:var(--muted)">ИНН</span>
                  <span style="font-family:monospace">592110786536</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
                  <span style="color:var(--muted)">Email</span>
                  <a href="mailto:adervis.digital@gmail.com" style="color:var(--primary2)">adervis.digital@gmail.com</a>
                </div>
                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
                  <span style="color:var(--muted)">Приложение</span>
                  <a href="https://app.adervis.ru" target="_blank" rel="noopener" style="color:var(--primary2)">app.adervis.ru</a>
                </div>
              </div>
            </div>

            <div style="margin-top:16px;padding:14px 16px;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.2);border-radius:12px;font-size:13px;color:var(--muted)">
              Версия приложения: <strong style="color:var(--text)">4.2</strong> · Доступ предоставляется онлайн сразу после оплаты
            </div>
          </div>
        `;
      }

      function renderPlans() {
        const sub = _userProfile;
        const planFeatures = {
          trial:  ["CRM и воронка продаж", "Калькулятор смет", "КП для клиентов", "Календарь задач", "1 пользователь", "Облако"],
          month1: ["Всё из пробного", "Безлимитные сделки", "Финансы и аналитика", "Экспорт Excel", "Договоры", "1 пользователь"],
          month3: ["Всё из «Месяца»", "До 3 пользователей", "Командная работа", "Синхронизация", "Экономия 17%", "Поддержка"],
          month6: ["Всё из «3 мес»", "До 5 пользователей", "Расширенная аналитика", "Версии смет", "Пакеты услуг", "Экономия 28%"],
          year:   ["Всё из «6 мес»", "До 10 пользователей", "Максимум функций", "API доступ", "Брендирование КП", "Экономия 42%"]
        };
        const promoValid = _promoState && typeof _promoState === "object";
        const cards = PLANS.map(p => {
          const isCurrent = sub && sub.subscription_plan === p.id && (sub.subscription_status === "active" || (sub.subscription_status === "trial" && p.id === "trial"));
          const isLoading = _buyingPlan === p.id;
          const discountedPrice = (promoValid && p.price > 0) ? Math.round(p.price * (1 - _promoState.discount / 100)) : null;
          const totalDisc = discountedPrice ? discountedPrice * Math.max(p.months, 1) : null;
          const payAmount = totalDisc !== null ? totalDisc : p.price * Math.max(p.months, 1);
          const btnLabel = isCurrent ? "✓ Активен" : isLoading ? "⏳..." : p.price === 0 ? "Бесплатно" : `Оплатить ${payAmount} ₽${p.months > 1 ? ` за ${p.months} мес.` : ""}`;
          const btnOff = isCurrent || p.price === 0 || !!_buyingPlan;
          const feats = planFeatures[p.id] || [];
          const border = isCurrent ? "var(--green)" : p.popular ? "var(--primary)" : "var(--line)";
          const bg = isCurrent ? "rgba(22,163,74,.06)" : p.popular ? "rgba(124,58,237,.05)" : "var(--panel2)";
          const priceHtml = p.price === 0
            ? `<div style="font-size:28px;font-weight:900;color:var(--green);line-height:1">Бесплатно</div><div style="font-size:11px;color:var(--muted);margin-bottom:16px">${escapeHtml(p.period)}</div>`
            : discountedPrice !== null
              ? `<div style="font-size:13px;color:var(--muted);text-decoration:line-through;line-height:1">${p.price} ₽</div><div style="font-size:28px;font-weight:900;color:var(--green);line-height:1.1">${discountedPrice} ₽</div><div style="font-size:11px;color:var(--muted)">${escapeHtml(p.period)}</div><div style="font-size:11px;color:var(--green);font-weight:700;margin-bottom:16px">−${_promoState.discount}% по промокоду</div>`
              : `<div style="font-size:28px;font-weight:900;line-height:1">${p.price} ₽</div><div style="font-size:11px;color:var(--muted)">${escapeHtml(p.period)}</div>${p.months > 1 ? `<div style="font-size:11px;color:var(--primary2);font-weight:750;margin-bottom:16px">${escapeHtml(p.save)}</div>` : `<div style="margin-bottom:16px"></div>`}`;
          return `
          <div class="plan-card" style="border-radius:18px;border:2px solid ${border};background:${bg};padding:20px 16px;display:flex;flex-direction:column;position:relative;min-width:0">
            ${p.popular && !isCurrent ? `<div style="position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,var(--primary),var(--blue));color:#fff;font-size:10px;font-weight:900;padding:2px 12px;border-radius:99px;white-space:nowrap">🔥 Популярный</div>` : ""}
            ${isCurrent ? `<div style="position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:var(--green);color:#fff;font-size:10px;font-weight:900;padding:2px 12px;border-radius:99px;white-space:nowrap">✓ Активен</div>` : ""}
            <div style="font-size:14px;font-weight:900;margin-bottom:10px">${escapeHtml(p.label)}</div>
            ${priceHtml}
            <div style="flex:1;display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
              ${feats.map(f => `<div style="font-size:12px;display:flex;align-items:flex-start;gap:5px"><span style="color:${isCurrent ? "var(--green)" : "var(--primary2)"};flex-shrink:0;font-size:11px;margin-top:1px">✓</span><span>${escapeHtml(f)}</span></div>`).join("")}
            </div>
            <button class="btn ${p.popular && !isCurrent ? "primary" : "small"}" style="width:100%;white-space:normal;line-height:1.25;text-align:center;${btnOff ? "opacity:.55;cursor:not-allowed" : ""}" onclick="app.buyPlan('${p.id}')" ${btnOff ? "disabled" : ""}>
              ${btnLabel}
            </button>
          </div>`;
        }).join("");
        return `
          <div class="panel">
            <div class="section-title" style="margin-bottom:24px">
              <div><h1 style="margin:0">Тарифный план</h1><p style="margin:4px 0 0;color:var(--muted)">Оплата через ЮKassa — карта, СБП, ЮМани</p></div>
              <button class="btn small" onclick="app.go('profile')">← Профиль</button>
            </div>
            <div class="grid five" style="gap:14px;margin-bottom:20px">
              ${cards}
            </div>
            ${_promoCodeInputHtml()}
            <p style="font-size:12px;color:var(--muted);padding:10px 16px;background:rgba(124,58,237,.06);border-radius:10px;margin:0;line-height:1.6">
              ✅ Подписка активируется автоматически после оплаты · Оплата разовая, без автосписаний — продление вручную, мы напомним заранее · Данные не теряются при смене тарифа, оставшиеся дни переносятся · Если срок истёк — данные сохраняются, доступ возобновляется сразу после оплаты
            </p>
          </div>
        `;
      }

      function renderProfile() {
        const email = _adminSession ? _adminSession.user.email : "";
        const sub = _userProfile;
        const subLabel = getSubscriptionLabel();
        const active = isSubscriptionActive();
        const initial = email ? email[0].toUpperCase() : "A";
        const us = getUserSettings();
        const displayName = us.displayName || "";
        const avatarHtml = us.avatarDataUrl
          ? `<img src="${us.avatarDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
          : `<span style="font-size:26px;font-weight:900">${escapeHtml(initial)}</span>`;

        // Subscription status details
        let subStatusBlock = "";
        if (sub) {
          const exp = sub.subscription_expires_at ? new Date(sub.subscription_expires_at) : null;
          const daysLeft = exp ? Math.max(0, Math.round((exp - new Date()) / 86400000)) : null;
          const expStr = exp ? exp.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" }) : "";
          const s = sub.subscription_status;
          const planLabel = { trial: "Пробный период", month1: "Месяц", month3: "3 месяца", month6: "6 месяцев", year: "Год", pro: "PRO" }[sub.subscription_plan] || sub.subscription_plan || "PRO";

          if (s === "active") {
            subStatusBlock = `
              <div style="background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.3);border-radius:14px;padding:16px 20px;margin-bottom:20px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                  <span style="font-size:20px">✅</span>
                  <div>
                    <div style="font-weight:900;font-size:15px;color:#86efac">Подписка активна — ${escapeHtml(planLabel)}</div>
                    ${exp ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">Действует до: ${escapeHtml(expStr)}${daysLeft !== null ? ` (ещё ${daysLeft} дн.)` : ""}</div>` : ""}
                  </div>
                </div>
              </div>`;
          } else if (s === "trial") {
            const urgency = daysLeft !== null && daysLeft <= 3;
            subStatusBlock = `
              <div style="background:rgba(202,138,4,.1);border:1px solid rgba(202,138,4,.3);border-radius:14px;padding:16px 20px;margin-bottom:20px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                  <span style="font-size:20px">${urgency ? "⚠️" : "⏳"}</span>
                  <div>
                    <div style="font-weight:900;font-size:15px;color:${urgency ? "var(--red)" : "var(--yellow)"}">Пробный период${daysLeft !== null ? ` — осталось ${daysLeft} дн.` : ""}</div>
                    ${exp ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">Истекает: ${escapeHtml(expStr)}</div>` : ""}
                  </div>
                </div>
                <p style="font-size:13px;margin:0;color:var(--muted)">После окончания пробного периода выберите тариф ниже, чтобы продолжить работу.</p>
              </div>`;
          } else {
            subStatusBlock = `
              <div style="background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);border-radius:14px;padding:16px 20px;margin-bottom:20px">
                <div style="font-weight:900;color:var(--red);margin-bottom:6px">⛔ Подписка истекла</div>
                <p style="font-size:13px;margin:0;color:var(--muted)">Выберите тариф ниже для продолжения работы.</p>
              </div>`;
          }
        }

        return `
          <div class="panel">
            ${_adminSession ? `
            <!-- ── PROFILE SECTION ── -->
            <div class="section-title" style="margin-bottom:20px">
              <div><h1 style="margin:0">Профиль</h1><p style="margin:4px 0 0;color:var(--muted)">Аккаунт, подписка и настройки</p></div>
              <div class="toolbar" style="gap:8px">
                <button class="btn small green" onclick="app.forceSaveToCloud()">☁️ Синхронизировать</button>
                <button class="btn small" onclick="app.adminLogout()">→ Выйти</button>
              </div>
            </div>

            <!-- Avatar + name -->
            <div class="panel" style="box-shadow:none;background:var(--panel2);margin-bottom:16px">
              <h2 style="margin-top:0;font-size:15px">Фото и имя</h2>
              <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
                <div style="position:relative;flex:0 0 80px">
                  <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--blue));display:flex;align-items:center;justify-content:center;color:#fff;overflow:hidden;box-shadow:0 6px 20px rgba(124,58,237,.35)">
                    ${avatarHtml}
                  </div>
                </div>
                <div style="flex:1;min-width:180px">
                  <div style="display:flex;gap:8px;margin-bottom:10px">
                    <label class="btn small" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                      📷 Изменить фото
                      <input type="file" accept="image/*" onchange="app.uploadUserAvatar(event)" style="display:none">
                    </label>
                    ${us.avatarDataUrl ? `<button class="btn small danger" onclick="app.removeUserAvatar()">Удалить</button>` : ""}
                  </div>
                  <div class="grid two" style="gap:8px">
                    <div class="field" style="margin:0">
                      <label>Имя</label>
                      <input placeholder="Ваше имя" value="${escapeHtml(us.displayName||"")}" oninput="app._saveUserField('displayName',this.value)">
                    </div>
                    <div class="field" style="margin:0">
                      <label>Email</label>
                      <input value="${escapeHtml(email)}" readonly style="opacity:.6">
                    </div>
                  </div>
                </div>
              </div>
            </div>

            ${subStatusBlock}

            <!-- Compact subscription link -->
            <div class="panel" style="box-shadow:none;background:var(--panel2);margin-bottom:16px">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <div>
                  <h2 style="margin:0 0 4px;font-size:15px">💳 Тарифный план</h2>
                  <div style="font-size:13px;color:var(--muted)">${escapeHtml(subLabel)}${sub && sub.subscription_expires_at ? ` · до ${new Date(sub.subscription_expires_at).toLocaleDateString("ru-RU", {day:"2-digit",month:"short",year:"numeric"})}` : ""}</div>
                </div>
                <button class="btn small primary" onclick="app.go('plans')" style="white-space:nowrap">Изменить тариф →</button>
              </div>
            </div>

            <!-- Security -->
            <div class="panel" style="box-shadow:none;background:var(--panel2);margin-bottom:16px">
              <h2 style="margin-top:0;font-size:15px">🔐 Безопасность</h2>
              <div id="changePasswordBox"></div>
              <div class="toolbar" style="gap:8px;flex-wrap:wrap">
                <button class="btn small" onclick="app.openChangePassword()">🔑 Изменить пароль</button>
                <button class="btn small danger" onclick="app.confirmDeleteAccount()">🗑 Удалить аккаунт</button>
              </div>
            </div>

            <!-- Team -->
            ${(() => {
              const agencyId = getAgencyId();
              const isOwner = _adminSession && _userProfile && _userProfile.agency_id === _adminSession.user.id;
              const onlineList = _onlineUsers.length ? _onlineUsers.map(u => `<span style="background:rgba(22,163,74,.12);border:1px solid rgba(22,163,74,.3);border-radius:99px;padding:2px 10px;font-size:12px">● ${escapeHtml(u)}</span>`).join(" ") : "";
              return `
              <div class="panel" style="box-shadow:none;background:var(--panel2);margin-bottom:16px">
                <h2 style="margin-top:0;font-size:15px">👥 Команда</h2>
                ${isOwner ? `
                  <p style="font-size:13px;color:var(--muted);margin:0 0 10px">Дайте этот код коллеге — при регистрации он вводит его и попадёт в ваше агентство.</p>
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <code style="flex:1;font-size:12px;background:rgba(0,0,0,.2);border-radius:8px;padding:8px 12px;border:1px solid var(--line);word-break:break-all;min-width:0">${escapeHtml(agencyId)}</code>
                    <button class="btn small" onclick="navigator.clipboard&&navigator.clipboard.writeText('${escapeHtml(agencyId)}').then(()=>app._toast('✅ Скопировано!'))">📋</button>
                  </div>
                  ${onlineList ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span style="font-size:12px;color:var(--muted)">Сейчас онлайн:</span>${onlineList}</div>` : ""}
                ` : `<p style="font-size:13px;color:var(--muted);margin:0">Вы в команде агентства${onlineList ? ` · Онлайн: ${onlineList}` : ""}</p>`}
              </div>`;
            })()}
            ` : `
            <div style="text-align:center;padding:32px 24px;margin-bottom:24px;background:var(--panel2);border-radius:16px;border:1px solid var(--line)">
              <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--blue));display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:#fff;margin:0 auto 16px;box-shadow:0 8px 28px rgba(124,58,237,.4)">A</div>
              <h2 style="margin:0 0 6px;font-size:20px">Войдите в ADERVIS CRM</h2>
              <p style="color:var(--muted);margin:0 0 18px;font-size:14px">Облачное хранение · Синхронизация · Подписка</p>
              <button class="btn primary" onclick="app.exitLocalModeAndLogin()" style="padding:12px 28px;font-size:15px;width:100%;max-width:280px">🔐 Войти / Зарегистрироваться</button>
              <p style="font-size:12px;color:var(--muted);margin:12px 0 0">14 дней бесплатно · Без карты · Данные не удаляются</p>
            </div>
            `}

            <!-- What's included block (replaces duplicate plan grid) -->
            <div class="panel" style="box-shadow:none;background:var(--panel2);margin-bottom:16px">
              <h2 style="margin-top:0;font-size:15px">🚀 Что включено в подписку</h2>
              <div class="grid two" style="gap:10px">
                ${[
                  ["📋 CRM и сделки", "Неограниченное число сделок и проектов по всем стадиям воронки"],
                  ["💰 Калькулятор смет", "100+ позиций каталога: съёмка, постпродакшн, ИИ, логистика"],
                  ["📄 КП и договоры", "Генерация коммерческих предложений и договоров за секунды"],
                  ["📅 Календарь", "Дедлайны, задачи и платежи по всем проектам в одном месте"],
                  ["💳 Финансы", "Доходы, расходы, маржа и аналитика по каждому проекту"],
                  ["☁️ Облачная синхронизация", "Realtime-синхронизация между устройствами и членами команды"],
                  ["👥 Команда", "Совместная работа — пригласите коллег через код приглашения"],
                  ["📱 Мобильная версия", "PWA — устанавливается на телефон и работает как приложение"]
                ].map(([title, desc]) => `
                  <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;background:var(--panel);border-radius:10px;border:1px solid var(--line)">
                    <div style="font-size:20px;flex:0 0 auto;line-height:1.2">${title.split(" ")[0]}</div>
                    <div>
                      <div style="font-size:13px;font-weight:800;margin-bottom:2px">${escapeHtml(title.slice(title.indexOf(" ")+1))}</div>
                      <div style="font-size:11px;color:var(--muted)">${escapeHtml(desc)}</div>
                    </div>
                  </div>`).join("")}
              </div>
            </div>
          </div>
        `;
      }

      /* ─── YOOKASSA SUBSCRIPTION PAYMENT ─── */
      async function buyPlan(planId) {
        if (!_adminSession) { toast("Войдите в аккаунт для оплаты"); return; }
        if (planId === "trial" || _buyingPlan) return;

        _buyingPlan = planId;
        render();

        try {
          const { url } = getSupabaseConfig();
          const resp = await fetch(`${url}/functions/v1/create-payment`, {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${_adminSession.access_token}`,
            },
            body: JSON.stringify({
              planId,
              promoCode: (_promoState && _promoState.code) ? _promoState.code : undefined,
            }),
          });

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: "Ошибка сети" }));
            throw new Error(err.error || "Ошибка создания платежа");
          }

          const { paymentUrl } = await resp.json();
          trackGoal("payment_click", { planId });
          window.location.href = paymentUrl;
        } catch (e) {
          toast("Ошибка оплаты: " + e.message);
          _buyingPlan = null;
          render();
        }
      }

      async function validatePromo() {
        const code = _promoCode.trim().toUpperCase();
        if (!code || !_supabase) return;
        _promoState = "checking";
        render();
        const { data, error } = await _supabase
          .from("promo_codes")
          .select("code,discount_percent,max_uses,uses_count,expires_at")
          .eq("code", code)
          .eq("is_active", true)
          .single();
        if (error || !data) {
          _promoState = "invalid";
        } else if (data.max_uses !== null && data.uses_count >= data.max_uses) {
          _promoState = "invalid";
        } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
          _promoState = "invalid";
        } else {
          _promoState = { code: data.code, discount: data.discount_percent };
        }
        render();
      }

      function clearPromo() {
        _promoCode = "";
        _promoState = null;
        render();
      }

      function gotoSubscription() {
        go("plans");
      }

      function checkPaymentReturn() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("payment") !== "success") return;
        history.replaceState({}, "", window.location.pathname);
        toast("⏳ Проверяем статус оплаты...");
        setTimeout(async () => {
          if (_adminSession) {
            await _loadUserProfile(_adminSession.user.id, _adminSession.user.email);
            render();
            if (isSubscriptionActive()) {
              trackGoal("payment_success", { planId: _userProfile && _userProfile.subscription_plan });
              toast("🎉 Подписка активирована! Спасибо за оплату.");
            } else {
              toast("Оплата обрабатывается — статус обновится автоматически.");
            }
          }
        }, 2500);
      }

      async function forceSaveToCloud() {
        if (!_supabase || !_adminSession) { toast("Не подключено к Supabase"); return; }
        const agencyId = getAgencyId();
        const skipKeys = ["view","mainMenuOpen","adminModal","clientModal","taskModal","financeModal","editTransactionModal","wizard","clientDraft","dealModal","dealSwitcherOpen"];
        const data = Object.fromEntries(Object.entries(state).filter(([k]) => !skipKeys.includes(k)));
        try {
          await _supabase.from("agency_state").upsert({ id: agencyId, state_json: data, updated_at: new Date().toISOString() });
          toast("☁️ Данные сохранены в облако");
        } catch(e) { toast("Ошибка сохранения: " + e.message); }
      }

      function openChangePassword() {
        const box = document.getElementById("changePasswordBox");
        if (!box) return;
        box.innerHTML = `
          <div class="panel" style="box-shadow:none;background:var(--panel2);margin-top:18px">
            <h2 style="margin-top:0;font-size:17px">Изменить пароль</h2>
            <div class="grid two">
              <div class="field">
                <label>Новый пароль</label>
                <input type="password" id="newPassInput" placeholder="мин. 6 символов">
              </div>
              <div class="field">
                <label>Повторите пароль</label>
                <input type="password" id="newPassConfirm" placeholder="">
              </div>
            </div>
            <div class="toolbar" style="margin-top:12px">
              <button class="btn primary" onclick="app.submitChangePassword()">Сохранить пароль</button>
              <button class="btn" onclick="document.getElementById('changePasswordBox').innerHTML=''">Отмена</button>
            </div>
          </div>
        `;
      }

      async function submitChangePassword() {
        const p1 = document.getElementById("newPassInput") && document.getElementById("newPassInput").value;
        const p2 = document.getElementById("newPassConfirm") && document.getElementById("newPassConfirm").value;
        if (!p1 || p1.length < 6) { toast("Пароль должен быть не менее 6 символов"); return; }
        if (p1 !== p2) { toast("Пароли не совпадают"); return; }
        if (!_supabase) return;
        const { error } = await _supabase.auth.updateUser({ password: p1 });
        if (error) { toast("Ошибка: " + error.message); return; }
        toast("✅ Пароль успешно изменён");
        document.getElementById("changePasswordBox").innerHTML = "";
      }

      async function confirmDeleteAccount() {
        if (!confirm("Вы уверены? Ваш профиль будет удалён. Общие данные агентства останутся нетронутыми.")) return;
        if (!confirm("Подтвердите ещё раз — удалить аккаунт?")) return;
        if (!_supabase) return;
        try {
          const userId = _adminSession.user.id;
          await _supabase.from("profiles").delete().eq("id", userId);
          await _supabase.auth.signOut();
          toast("Аккаунт удалён");
        } catch(e) { toast("Ошибка удаления: " + e.message); }
      }

      /* ═══════════════════════════════════════════════════════
         HELP / ОНБОРДИНГ
      ═══════════════════════════════════════════════════════ */
      const ONBOARD_SLIDES = [
        {
          title: "Добро пожаловать в ADERVIS CRM",
          body: "Полноценная CRM для видеопродакшн агентств. Управляйте сделками, сметами, клиентами и финансами — всё в одном месте.",
          img: "🎬  ADERVIS CRM · дашборд агентства"
        },
        {
          title: "Управление сделками",
          body: "Создайте первую сделку через «+ Новая сделка». Ведите воронку: Лид → Бриф → КП → Договор → Предоплата → В работе → Сдано.",
          img: "📋  Доска сделок — карточки с кнопкой смены статуса"
        },
        {
          title: "Финансы и смета",
          body: "Составляйте сметы из каталога, применяйте пакеты. В каждой сделке — вкладка «Финансы»: поступления, расходы, маржа автоматически.",
          img: "💰  Смета и раздел Финансы — итоговая сводка"
        },
        {
          title: "Командная работа",
          body: "Добавляйте участников команды, назначайте задачи с дедлайнами. Работайте совместно — изменения синхронизируются через Supabase Realtime.",
          img: "👥  Раздел Команда — карточки участников и задачи"
        },
        {
          title: "Настройки и шаблоны",
          body: "В разделе «Настройки» задайте данные компании, логотип и реквизиты. В «Договорах» — готовые шаблоны для быстрой подготовки документов.",
          img: "⚙️  Настройки компании и библиотека договоров"
        },
        {
          title: "Тарифы и подписка",
          body: "ADERVIS CRM работает по подписке. Напишите на adervis.digital@gmail.com для оплаты и активации нужного тарифа. Установите как приложение (PWA) для работы офлайн.",
          img: "🚀  Тарифные планы — выберите подходящий"
        }
      ];

      function renderHelpModal() {
        const idx = state.helpSlide || 0;
        const total = ONBOARD_SLIDES.length;
        const slide = ONBOARD_SLIDES[idx];
        return `
          <div class="modal-overlay" onclick="event.target===this&&app.closeHelpModal()">
            <div class="modal-box" style="width:min(520px,calc(100vw - 24px));padding:24px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <div>
                  <div style="font-size:11px;font-weight:850;color:var(--muted);letter-spacing:.08em;text-transform:uppercase">Шаг ${idx + 1} из ${total}</div>
                  <h2 style="margin:4px 0 0;font-size:19px">Знакомство с ADERVIS CRM</h2>
                </div>
                <button onclick="app.closeHelpModal()" style="background:none;border:none;font-size:24px;color:var(--muted);cursor:pointer;line-height:1;padding:0 4px;flex:0 0 auto">×</button>
              </div>

              <div class="ob-slider-wrap">
                <div class="ob-slides" style="transform:translateX(-${idx * 100}%)">
                  ${ONBOARD_SLIDES.map((s, i) => `
                    <div class="ob-slide">
                      <div class="ob-placeholder">${escapeHtml(s.img)}</div>
                      <h3>${escapeHtml(s.title)}</h3>
                      <p style="color:var(--muted)">${escapeHtml(s.body)}</p>
                    </div>
                  `).join("")}
                </div>
              </div>

              <div class="ob-nav">
                <button class="ob-arrow" onclick="app.helpPrev()" ${idx === 0 ? "disabled" : ""}>&#8592;</button>
                <div class="ob-dots">
                  ${ONBOARD_SLIDES.map((_, i) => `
                    <div class="ob-dot ${i === idx ? "active" : ""}" onclick="app.setHelpSlide(${i})" title="Слайд ${i+1}"></div>
                  `).join("")}
                </div>
                ${idx < total - 1
                  ? `<button class="ob-arrow" onclick="app.helpNext()">&#8594;</button>`
                  : `<button class="btn primary" style="padding:7px 16px;font-size:13px" onclick="app.closeHelpModal();app.startWizard()">Начать →</button>`
                }
              </div>

              ${idx === total - 1 ? `
                <div style="margin-top:14px;text-align:center">
                  <button class="btn" style="font-size:12px" onclick="app.closeHelpModal();app.go('knowledge')">Открыть Базу знаний</button>
                </div>
              ` : ""}
            </div>
          </div>
        `;
      }

      function openHelpModal() {
        state.helpModal = true;
        state.helpSlide = 0;
        renderModal();
      }
      function closeHelpModal() {
        state.helpModal = false;
        renderModal();
      }
      function helpNext() {
        const total = ONBOARD_SLIDES.length;
        state.helpSlide = Math.min((state.helpSlide || 0) + 1, total - 1);
        renderModal();
      }
      function helpPrev() {
        state.helpSlide = Math.max((state.helpSlide || 0) - 1, 0);
        renderModal();
      }
      function setHelpSlide(i) {
        state.helpSlide = i;
        renderModal();
      }

      /* ═══════════════════════════════════════════════════════
         БАЗА ЗНАНИЙ
      ═══════════════════════════════════════════════════════ */
      const KB_CATS = { all: "Все", sales: "Продажи", price: "Ценообразование", prod: "Производство", client: "Клиенты", guide: "Руководство" };

      function renderKnowledge() {
        const docs = (state.knowledgeDocs || []);
        const search = state.kbSearch || "";
        const catFilter = state.kbCatFilter || "all";

        if (state.kbView === "edit") {
          const doc = docs.find(d => d.id === state.kbEditId);
          if (!doc) { state.kbView = "list"; return renderKnowledge(); }
          return `
            <div class="panel">
              <div class="section-title">
                <div style="display:flex;align-items:center;gap:12px">
                  <button class="btn small" onclick="app.kbBack()">← Назад</button>
                  <h2 style="margin:0">${escapeHtml(doc.title)}</h2>
                </div>
                <div class="toolbar no-print">
                  <button class="btn small green" onclick="app.kbSave()">Сохранить</button>
                  <button class="btn small" onclick="app.kbDuplicate('${doc.id}')">Дублировать</button>
                  <button class="btn small danger" onclick="app.kbDelete('${doc.id}')">Удалить</button>
                </div>
              </div>
              <div class="kb-editor">
                <div class="grid two">
                  <div class="field">
                    <label>Заголовок</label>
                    <input id="kb_title" value="${escapeHtml(doc.title)}">
                  </div>
                  <div class="field">
                    <label>Категория</label>
                    <select id="kb_cat">
                      ${Object.entries(KB_CATS).filter(([k]) => k !== "all").map(([k, v]) =>
                        `<option value="${k}" ${doc.cat === k ? "selected" : ""}>${v}</option>`).join("")}
                    </select>
                  </div>
                </div>
                <div class="field">
                  <label>Содержимое (Markdown)</label>
                  <textarea id="kb_content" style="min-height:420px;font-family:monospace;font-size:13px">${escapeHtml(doc.content || "")}</textarea>
                </div>
              </div>
            </div>
          `;
        }

        const filtered = docs.filter(d => {
          const matchCat = catFilter === "all" || d.cat === catFilter;
          const q = search.toLowerCase();
          const matchSearch = !q || d.title.toLowerCase().includes(q) || (d.content||"").toLowerCase().includes(q);
          return matchCat && matchSearch;
        });

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>База знаний</h1>
                <p>Полезные статьи о продажах, производстве и работе с клиентами.</p>
              </div>
            </div>

            <div class="grid two" style="margin-bottom:16px">
              ${field("Поиск", `<input value="${escapeHtml(search)}" oninput="app.kbSetSearch(this.value)" placeholder="Поиск по документам...">`)}
              ${field("Категория", `<select onchange="app.kbSetCat(this.value)">${Object.entries(KB_CATS).map(([k,v]) => `<option value="${k}" ${catFilter===k?"selected":""}>${v}</option>`).join("")}</select>`)}
            </div>

            <div class="tabs" style="margin-bottom:20px">
              ${Object.entries(KB_CATS).map(([k, v]) => {
                const cnt = k === "all" ? docs.length : docs.filter(d => d.cat === k).length;
                return `<button class="tab ${catFilter===k?"active":""}" onclick="app.kbSetCat('${k}')">${v} <span style="opacity:.6;font-size:11px">${cnt}</span></button>`;
              }).join("")}
            </div>

            <div class="grid three">
              <div class="kb-new-card" onclick="app.kbNew()">
                <div class="kb-new-icon">+</div>
                <div class="kb-new-label">Новый документ</div>
              </div>
              ${filtered.map(d => `
                <div class="kb-doc-card" onclick="app.kbOpen('${d.id}')">
                  <span class="kb-cat-badge ${d.cat || "guide"}">${escapeHtml(KB_CATS[d.cat] || d.cat || "")}</span>
                  <h3>${escapeHtml(d.title)}</h3>
                  <p>${escapeHtml((d.content || "").replace(/^#.*\n?/gm,"").trim().slice(0, 100))}...</p>
                  <div style="display:flex;gap:8px;margin-top:12px" onclick="event.stopPropagation()">
                    <button class="btn small" onclick="app.kbOpen('${d.id}')">Читать</button>
                    <button class="btn small" onclick="app.kbDuplicate('${d.id}')">Дублировать</button>
                  </div>
                </div>
              `).join("")}
              ${filtered.length === 0 ? `<p style="grid-column:1/-1;text-align:center;padding:32px;color:var(--muted)">Ничего не найдено</p>` : ""}
            </div>
          </div>
        `;
      }

      function kbOpen(id) {
        state.kbEditId = id; state.kbView = "edit"; render();
      }
      function kbBack() { state.kbView = "list"; render(); }
      function kbSetSearch(v) { state.kbSearch = v; render(); }
      function kbSetCat(v) { state.kbCatFilter = v; render(); }
      function kbNew() {
        const doc = { id: uid("kb"), cat: "guide", title: "Новый документ", content: "# Заголовок\n\nВаш текст...", updatedAt: new Date().toISOString() };
        state.knowledgeDocs = [doc, ...(state.knowledgeDocs || [])];
        state.kbEditId = doc.id; state.kbView = "edit"; save(); render();
      }
      function kbSave() {
        const doc = (state.knowledgeDocs || []).find(d => d.id === state.kbEditId);
        if (!doc) return;
        const t = document.getElementById("kb_title");
        const c = document.getElementById("kb_content");
        const cat = document.getElementById("kb_cat");
        if (t) doc.title = t.value;
        if (c) doc.content = c.value;
        if (cat) doc.cat = cat.value;
        doc.updatedAt = new Date().toISOString();
        toast("Документ сохранён");
        save(); render();
      }
      function kbDuplicate(id) {
        const doc = (state.knowledgeDocs || []).find(d => d.id === id);
        if (!doc) return;
        const copy = { ...deepClone(doc), id: uid("kb"), title: doc.title + " (копия)", updatedAt: new Date().toISOString() };
        state.knowledgeDocs = [copy, ...(state.knowledgeDocs || [])];
        toast("Документ дублирован"); save(); render();
      }
      function kbDelete(id) {
        if (!confirm("Удалить документ?")) return;
        state.knowledgeDocs = (state.knowledgeDocs || []).filter(d => d.id !== id);
        state.kbView = "list"; toast("Документ удалён"); save(); render();
      }

      function renderAdminModalHtml() {
        const m = state.adminModal;
        if (!m) return "";
        return `
          <div class="modal-overlay" onclick="event.target===this&&app.closeAdminModal()">
            <div class="admin-modal-box">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 style="margin:0;font-size:20px">🔐 Вход для администратора</h2>
                <button onclick="app.closeAdminModal()" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px">×</button>
              </div>
              <p style="margin:0 0 18px;font-size:13px">Войдите через Supabase Auth для совместного редактирования.</p>
              ${m.error ? `<div style="background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.3);border-radius:10px;padding:10px 14px;color:var(--red);font-size:13px;margin-bottom:14px">${escapeHtml(m.error)}</div>` : ""}
              <div class="field" style="margin-bottom:14px">
                <label>Email</label>
                <input type="email" placeholder="you@example.com" value="${escapeHtml(m.email)}"
                  oninput="app.setAdminField('email',this.value)"
                  onkeydown="if(event.key==='Enter')app.adminLogin()">
              </div>
              <div class="field" style="margin-bottom:20px">
                <label>Пароль</label>
                <input type="password" placeholder="••••••••" value="${escapeHtml(m.password)}"
                  oninput="app.setAdminField('password',this.value)"
                  onkeydown="if(event.key==='Enter')app.adminLogin()">
              </div>
              <div class="toolbar">
                <button class="btn primary full" onclick="app.adminLogin()" ${m.loading ? "disabled" : ""}>
                  ${m.loading ? "Входим..." : "Войти"}
                </button>
              </div>
              <p style="font-size:11px;color:var(--muted);margin:12px 0 0;text-align:center">
                Управление пользователями — в панели Supabase.<br>Настройте URL и ключ в разделе Настройки.
              </p>
            </div>
          </div>
        `;
      }

      function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function uid(prefix = "id") {
        return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
      }

      function numberValue(value, fallback = 0) {
        const n = Number(String(value ?? "").replace(",", "."));
        return Number.isFinite(n) ? n : fallback;
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function optionValueHtml(value, label, selected) {
        return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`;
      }

      function todayIso() {
        return new Date().toISOString().slice(0, 10);
      }

      function dateStamp() {
        return todayIso();
      }

      function formatDate(value) {
        if (!value) return "";
        try {
          return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
        } catch {
          return String(value);
        }
      }

      function deadlineUrgency(deadline) {
        if (!deadline) return null;
        const today = new Date(); today.setHours(0,0,0,0);
        const d = new Date(deadline); d.setHours(0,0,0,0);
        const days = Math.round((d - today) / 86400000);
        if (days < 0) return { days, level: "overdue", label: `Просрочен на ${Math.abs(days)} дн.`, color: "var(--red)" };
        if (days === 0) return { days, level: "critical", label: "Сегодня дедлайн!", color: "var(--red)" };
        if (days <= 7) return { days, level: "critical", label: `${days} дн. до дедлайна`, color: "var(--red)" };
        if (days <= 14) return { days, level: "warning", label: `${days} дн. до дедлайна`, color: "var(--yellow)" };
        return { days, level: "ok", label: `${days} дн.`, color: "var(--muted)" };
      }

      function taxRateByType(type) {
        const option = TAX_OPTIONS.find(item => item.id === type);
        return option ? option.rate : 0;
      }

      function taxOptionsHtml(selected) {
        return TAX_OPTIONS.map(option => optionValueHtml(option.id, option.label, selected)).join("");
      }

      const DEFAULT_KB_DOCS = [
        { id: "kb_sales_1", cat: "sales", title: "Как правильно презентовать смету клиенту", content: `# Как правильно презентовать смету клиенту

## Ключевые принципы

**1. Не отправляйте смету просто файлом — объясняйте её.**
Клиент не понимает, что значит «монтаж» за 12 000 ₽. Объясните что входит, зачем это нужно.

**2. Сначала ценность, потом цена.**
Расскажите, какой результат получит клиент, а потом называйте стоимость.

**3. Давайте три варианта.**
Старт / Профи / Премиум — клиенту проще выбрать из трёх, чем соглашаться или отказываться.

## Структура встречи по смете

1. Напомните задачу клиента (2 мин)
2. Покажите состав работ с объяснением каждого этапа (5 мин)
3. Назовите цену — уверенно, без извинений
4. Расскажите о следующем шаге: бриф → предоплата → старт

## Работа с возражением «дорого»

— Да, это инвестиция. Давайте посмотрим, что можно убрать без потери результата?
— Что для вас важнее: вписаться в бюджет или получить конкретный результат?
— Можем разбить на этапы с предоплатой.

## Чего НЕ делать

- Не оправдываться за цену
- Не делать скидки сразу — сначала уточните почему дорого
- Не отправлять смету без созвона/встречи`, updatedAt: new Date().toISOString() },

        { id: "kb_price_1", cat: "price", title: "Ценообразование в видеопродакшне — базовые принципы", content: `# Ценообразование в видеопродакшне

## Из чего складывается цена

**Человеко-часы** — основная статья. Режиссёр, оператор, монтажёр. Считайте от дневной/часовой ставки.

**Оборудование** — камера, свет, звук. Аренда или амортизация своего.

**Пост-продакшн** — монтаж, цветокоррекция, звук, графика. Часто недооценивается.

**Сопутствующие расходы** — транспорт, питание, аренда локации, реквизит, актёры.

**Маржа и риски** — закладывайте 20–30% на непредвиденное.

## Региональные ставки для Перми (2025)

| Специалист | Дневная ставка |
|---|---|
| Оператор (базовый) | 6 000 – 10 000 ₽ |
| Оператор (профи/DOP) | 12 000 – 20 000 ₽ |
| Режиссёр | 10 000 – 25 000 ₽ |
| Монтажёр | 3 000 – 8 000 ₽/час работы |
| Звукорежиссёр | 5 000 – 12 000 ₽ |
| Фотограф | 5 000 – 15 000 ₽ |

## Формулы расчёта

**Монтаж ролика:** (длина × коэф. сложности × ставка/час) + правки
**Съёмочный день:** (кол-во специалистов × ставки) + техника + логистика
**Итог:** (сумма этапов × налог) × (1 + маржа)

## Типичные ошибки

- Не считать время на пре-продакшн (бриф, сценарий, раскадровка)
- Забывать про правки (2 круга включено, остальные платно)
- Не закладывать время проект-менеджера`, updatedAt: new Date().toISOString() },

        { id: "kb_client_1", cat: "client", title: "Как работать с клиентом: от лида до закрытия", content: `# Работа с клиентом: от лида до закрытия

## Воронка продаж

**Лид → Бриф → КП → Согласование → Договор → Предоплата → В работе → Сдано**

## Шаги при получении нового лида

1. **Ответить в течение 1 часа** — скорость реакции критична
2. **Задать квалифицирующие вопросы:**
   - Что нужно снять / какая задача?
   - Когда нужен результат?
   - Есть ли примерный бюджет?
3. **Назначить созвон или встречу для брифа**
4. **Создать сделку в CRM** сразу же

## Бриф — обязательные вопросы

- Цель видео (продажи, HR, имидж, обучение)?
- Кто целевая аудитория?
- Где будет использоваться (YouTube, сайт, соцсети, ТВ)?
- Примеры видео, которые нравятся
- Сроки сдачи
- Бюджет (примерно)
- Кто принимает решение?

## Работа с трудными клиентами

**«Нам нужно быстро и дёшево»**
→ Объясните, что качество требует времени и ресурсов. Предложите более простой пакет.

**«Мы подумаем»**
→ Уточните: что мешает принять решение? Предложите следующий шаг.

**Бесконечные правки**
→ Чётко пропишите в договоре: 2 круга правок включено, далее — по тарифу.

## Подписание договора

Всегда работайте с договором. Минимум:
- Состав работ
- Сроки
- Стоимость и порядок оплаты (50/50 стандарт)
- Количество кругов правок`, updatedAt: new Date().toISOString() },

        { id: "kb_prod_1", cat: "prod", title: "Этапы производства видеоролика", content: `# Этапы производства видеоролика

## Пре-продакшн (подготовка)

**Бриф и ТЗ**
Фиксируем всё что обсудили с клиентом. Цель, аудитория, сроки, бюджет, примеры.

**Концепция и сценарий**
Разрабатываем идею, пишем текст/диалоги. Согласовываем с клиентом.

**Раскадровка (storyboard)**
Для сложных роликов — рисуем ключевые кадры. Это экономит время на съёмке.

**Подготовка к съёмке**
- Локация: поиск, согласование, разрешения
- Кастинг (если нужны актёры/модели)
- Реквизит, гардероб, декорации
- Съёмочный план (schedule)

## Продакшн (съёмка)

**Организация площадки**
Приезжаем заранее, расставляем оборудование, проверяем свет и звук.

**Съёмка**
Работаем по списку кадров. Снимаем с запасом (+20–30% материала).

**Звук на площадке**
Петличка или направленный микрофон. Чистый звук = 50% качества ролика.

## Пост-продакшн (монтаж и финиш)

1. **Черновой монтаж** (Rough Cut) — структура, хронометраж
2. **Согласование с клиентом** — правки по структуре
3. **Финальный монтаж** — переходы, темп, атмосфера
4. **Цветокоррекция** — единый стиль, настроение
5. **Звук** — чистка, музыка, сведение
6. **Графика и титры** — логотип, имена, субтитры
7. **Финальное согласование** — 1–2 круга правок
8. **Сдача** — в нужных форматах (MP4 H.264 / ProRes)

## Форматы для разных платформ

| Платформа | Формат | Размер |
|---|---|---|
| YouTube | 16:9, 1080p/4K | MP4 H.264 |
| Instagram Reels | 9:16, 1080×1920 | MP4 |
| VK Видео | 16:9 или 9:16 | MP4 |
| Сайт | 16:9, 1080p | MP4, WebM |
| ТВ | 16:9, 1080i/4K | MXF/ProRes |`, updatedAt: new Date().toISOString() },

        { id: "kb_guide_1", cat: "guide", title: "Начало работы в ADERVIS CRM", content: `# Начало работы в ADERVIS CRM digital v4.0

## Что умеет программа

**Сделки** — ведите клиентов по воронке от первого контакта до оплаты.

**Смета** — рассчитывайте стоимость видеопроекта с помощью каталога услуг.

**Пакеты** — готовые наборы услуг для быстрого старта.

**Каталог** — полный список услуг с редактируемыми ценами.

**Финансы** — контролируйте поступления и расходы по каждому проекту.

**Клиенты** — база клиентов с историей проектов.

**Договора** — создавайте договора на основе шаблонов.

## Быстрый старт

### Шаг 1: Создайте первую сделку
Нажмите «+ Новая сделка» → введите имя клиента → выберите тип проекта.

### Шаг 2: Добавьте услуги в смету
Перейдите во вкладку «Смета» → выберите услуги из каталога или примените готовый пакет.

### Шаг 3: Сформируйте КП
Вкладка «КП» → настройте шаблон → скопируйте текст или распечатайте.

### Шаг 4: Ведите сделку по воронке
Меняйте статус: Лид → Бриф → КП → Договор → Предоплата → В работе → Сдано.

### Шаг 5: Фиксируйте оплаты
Вкладка «Финансы» → добавляйте поступления и расходы.

## Горячие клавиши

- **Ctrl+Z** — отменить последнее действие
- **Клик по логотипу** — главное меню

## Настройка компании

Перейдите в «Настройки» → заполните данные компании, загрузите логотип, заполните реквизиты для договоров.`, updatedAt: new Date().toISOString() }
      ];

      function defaultState() {
        return {
          appVersion: APP_VERSION,
          view: "home",
          dealView: "estimate",
          wizard: null,
          mainMenuOpen: false,
          helpModal: false,
          helpSlide: 0,
          adminModal: null,
          clientModal: null,
          taskModal: null,
          dealModal: null,
          dealSwitcherOpen: false,
          editTransactionModal: null,
          contracts: [],
          contractEditId: "",
          calendarMonth: "",
          calendarSelectedDay: "",
          tab: "all",
          search: "",
          filter: "all",
          sort: "name",
          projectFilter: "all",
          projectSort: "updatedDesc",
          crmFilter: "all",
          clientDetailId: "",
          financeModal: null,
          gFinFilter: "all",
          gFinTypeFilter: "all",
          gFinSubTab: "transactions",
          gFinDatePreset: "all",
          gFinDateFrom: "",
          gFinDateTo: "",
          telegramChatIds: [],
          clientMode: false,
          recentlyAdded: "",
          favorites: {},
          selected: {},
          estimateOrder: [],
          lineCollapsed: {},
          stageCollapsed: {},
          customItems: [],
          hiddenItems: {},
          permanentlyDeleted: {},
          catalogPrices: {},
          priceHistory: {},
          versions: [],
          savedProjects: [],
          clients: [],
          clientDraft: null,
          activeProjectId: "",
          activeClientId: "",
          stages: deepClone(DEFAULT_STAGES),
          packages: deepClone(DEFAULT_PACKAGES),
          tasks: [],
          payments: [],
          expenses: [],
          team: [],
          project: {
            id: "",
            createdAt: "",
            name: "Видео-проект",
            client: "",
            clientId: "",
            city: "",
            status: "Черновик",
            crmStatus: "Лид",
            type: "Видео",
            days: 1,
            currency: "₽",
            discount: 0,
            taxType: "none",
            deadline: "",
            manager: "",
            source: "",
            priority: "Средний",
            budgetComment: "",
            proposalTemplate: "classic",
            proposalMode: "detailed",
            internalNote: "",
            proposalNote: "Стоимость рассчитана на основе базовых тарифов агентства и может меняться после уточнения задачи.",
            paymentTerms: "50% предоплата, 50% после сдачи материалов.",
            deliveryTerms: "Готовые материалы передаются ссылкой на облачное хранилище.",
            includedText: "Базовая работа команды, согласованные этапы, минимальный комплект услуг по смете.",
            excludedText: "Сложная графика, актёры, студии, расширенная техника, музыка с платной лицензией и дополнительные версии, если они не указаны в смете."
          },
          company: {
            name: "Adervis",
            phone: "",
            email: "",
            site: "",
            logoUrl: "logo-icon.svg",
            desc: "Видеопроизводство и digital-упаковка для бизнеса.",
            details: "Видеопроизводство и digital-упаковка для бизнеса.",
            terms: "Срок действия предложения — 7 календарных дней. Финальные сроки и состав работ уточняются после брифа.",
            requisites: ""
          },
          proposalTemplates: {
            classic: {
              name: "Классический",
              intro: "Подготовили предварительную смету на производство видео. Стоимость рассчитана на основе базовых тарифов агентства.",
              showStages: true,
              showDetails: true,
              showOptional: true
            },
            agency: {
              name: "Для агентства",
              intro: "Ниже — производственная смета с базовым составом работ. Цены указаны как минимальная стартовая база.",
              showStages: true,
              showDetails: true,
              showOptional: true
            },
            premium: {
              name: "Премиальный",
              intro: "Предлагаем комплексный подход к производству видео с прозрачной структурой этапов и стоимости.",
              showStages: true,
              showDetails: true,
              showOptional: true
            },
            short: {
              name: "Короткое КП",
              intro: "Краткая смета по проекту с итоговой стоимостью и основными этапами.",
              showStages: false,
              showDetails: true,
              showOptional: true
            }
          },
          notifications: [],
          notifPopupOpen: false,
          knowledgeDocs: deepClone(DEFAULT_KB_DOCS),
          kbView: "list",
          kbEditId: "",
          kbSearch: "",
          kbCatFilter: "all",
          aiProposalCount: 0
        };
      }

      let state = defaultState();
      let draggedLineId = "";
      let undoStack = [];
      let redoStack = [];
      let isUndoing = false;
      const MAX_UNDO = 50;

      function normalizeClient(client) {
        return {
          id: client?.id || uid("client"),
          name: client?.name || "Новый клиент",
          company: client?.company || "",
          phone: client?.phone || "",
          email: client?.email || "",
          city: client?.city || "",
          contactPerson: client?.contactPerson || "",
          source: client?.source || "",
          note: client?.note || "",
          requisites: client?.requisites || "",
          status: client?.status || "new",
          createdAt: client?.createdAt || new Date().toISOString(),
          updatedAt: client?.updatedAt || new Date().toISOString()
        };
      }

      function normalizeTask(task) {
        return {
          id: task?.id || uid("task"),
          title: task?.title || "Новая задача",
          status: TASK_STATUSES.includes(task?.status) ? task.status : "Новая",
          priority: PRIORITIES.includes(task?.priority) ? task.priority : "Средний",
          assignee: task?.assignee || "",
          deadline: task?.deadline || "",
          note: task?.note || "",
          createdAt: task?.createdAt || new Date().toISOString(),
          updatedAt: task?.updatedAt || new Date().toISOString()
        };
      }

      function normalizePayment(payment) {
        return {
          id: payment?.id || uid("payment"),
          title: payment?.title || "Платёж",
          amount: numberValue(payment?.amount, 0),
          date: payment?.date || todayIso(),
          method: payment?.method || "",
          note: payment?.note || "",
          createdAt: payment?.createdAt || new Date().toISOString()
        };
      }

      function normalizeExpense(expense) {
        return {
          id: expense?.id || uid("expense"),
          title: expense?.title || "Расход",
          amount: numberValue(expense?.amount, 0),
          date: expense?.date || todayIso(),
          category: expense?.category || "",
          note: expense?.note || "",
          createdAt: expense?.createdAt || new Date().toISOString()
        };
      }

      function normalizeTeamMember(member) {
        return {
          id: member?.id || uid("team"),
          name: member?.name || "Участник",
          role: member?.role || "",
          rate: numberValue(member?.rate, 0),
          payout: numberValue(member?.payout, member?.rate || 0),
          paid: Boolean(member?.paid),
          note: member?.note || "",
          createdAt: member?.createdAt || new Date().toISOString()
        };
      }

      function normalizeSavedProject(project) {
        const snapshot = project?.snapshot || {
          project: deepClone(project?.project || {}),
          selected: deepClone(project?.selected || {}),
          estimateOrder: deepClone(project?.estimateOrder || []),
          lineCollapsed: deepClone(project?.lineCollapsed || {}),
          stageCollapsed: deepClone(project?.stageCollapsed || {}),
          customItems: deepClone(project?.customItems || []),
          catalogPrices: deepClone(project?.catalogPrices || {}),
          hiddenItems: deepClone(project?.hiddenItems || {}),
          stages: deepClone(project?.stages || DEFAULT_STAGES),
          versions: deepClone(project?.versions || []),
          tasks: deepClone(project?.tasks || []),
          payments: deepClone(project?.payments || []),
          expenses: deepClone(project?.expenses || []),
          team: deepClone(project?.team || [])
        };

        return {
          id: project?.id || uid("project"),
          name: project?.name || project?.project?.name || "Проект",
          client: project?.client || project?.project?.client || "",
          clientId: project?.clientId || project?.project?.clientId || "",
          status: project?.status || project?.project?.status || "Черновик",
          crmStatus: project?.crmStatus || project?.project?.crmStatus || "Лид",
          priority: project?.priority || project?.project?.priority || "Средний",
          deadline: project?.deadline || project?.project?.deadline || "",
          city: project?.city || project?.project?.city || "",
          total: numberValue(project?.total, 0),
          paid: numberValue(project?.paid, 0),
          debt: numberValue(project?.debt, 0),
          expensesTotal: numberValue(project?.expensesTotal, 0),
          profit: numberValue(project?.profit, 0),
          createdAt: project?.createdAt || project?.at || new Date().toISOString(),
          updatedAt: project?.updatedAt || project?.at || new Date().toISOString(),
          snapshot
        };
      }

      function migrateState(raw) {
        const base = defaultState();
        const old = raw && typeof raw === "object" ? raw : {};

        const migrated = {
          ...base,
          ...old,
          appVersion: APP_VERSION,
          project: { ...base.project, ...(old.project || {}) },
          company: { ...base.company, ...(old.company || {}) },
          proposalTemplates: { ...base.proposalTemplates, ...(old.proposalTemplates || {}) },
          selected: old.selected || {},
          estimateOrder: Array.isArray(old.estimateOrder) ? old.estimateOrder : [],
          lineCollapsed: old.lineCollapsed || {},
          stageCollapsed: old.stageCollapsed || {},
          customItems: Array.isArray(old.customItems) ? old.customItems : [],
          hiddenItems: old.hiddenItems || {},
          permanentlyDeleted: old.permanentlyDeleted || {},
          catalogPrices: old.catalogPrices || {},
          priceHistory: old.priceHistory || {},
          versions: Array.isArray(old.versions) ? old.versions : [],
          favorites: old.favorites || {},
          clients: Array.isArray(old.clients) ? old.clients.map(normalizeClient) : [],
          savedProjects: Array.isArray(old.savedProjects) ? old.savedProjects.map(normalizeSavedProject) : [],
          tasks: Array.isArray(old.tasks) ? old.tasks.map(normalizeTask) : [],
          payments: Array.isArray(old.payments) ? old.payments.map(normalizePayment) : [],
          expenses: Array.isArray(old.expenses) ? old.expenses.map(normalizeExpense) : [],
          team: Array.isArray(old.team) ? old.team.map(normalizeTeamMember) : [],
          activeProjectId: old.activeProjectId || old.project?.id || "",
          activeClientId: old.activeClientId || old.project?.clientId || "",
          stages: Array.isArray(old.stages) && old.stages.length ? old.stages : base.stages,
          packages: Array.isArray(old.packages) && old.packages.length ? old.packages : base.packages,
          contracts: Array.isArray(old.contracts) ? old.contracts : [],
          contractEditId: "",
          clientDraft: null,
          dealView: old.dealView || "estimate",
          wizard: null,
          crmFilter: old.crmFilter || "all",
          recentlyAdded: "",
          mainMenuOpen: false,
          clientModal: null,
          taskModal: null,
          dealModal: null,
          dealSwitcherOpen: false,
          editTransactionModal: null,
          contractEditId: old.contractEditId || "",
          calendarMonth: old.calendarMonth || "",
          calendarSelectedDay: ""
        };

        if (!migrated.project.crmStatus) migrated.project.crmStatus = "Лид";
        if (!migrated.project.priority) migrated.project.priority = "Средний";

        const selectedKeys = Object.keys(migrated.selected || {});
        const ordered = migrated.estimateOrder.filter(id => migrated.selected[id]);
        const missing = selectedKeys.filter(id => !ordered.includes(id));
        migrated.estimateOrder = [...ordered, ...missing];

        return migrated;
      }

      function sanitizeDate(d) {
        if (!d || typeof d !== "string") return "";
        const yr = parseInt(d.slice(0, 4), 10);
        return (yr >= 2020 && yr <= 2099) ? d : "";
      }

      function normalizeState() {
        const base = defaultState();

        state = {
          ...base,
          ...state,
          project: { ...base.project, ...(state.project || {}) },
          company: { ...base.company, ...(state.company || {}) },
          proposalTemplates: { ...base.proposalTemplates, ...(state.proposalTemplates || {}) },
          selected: state.selected || {},
          estimateOrder: Array.isArray(state.estimateOrder) ? state.estimateOrder : [],
          lineCollapsed: state.lineCollapsed || {},
          stageCollapsed: state.stageCollapsed || {},
          customItems: Array.isArray(state.customItems) ? state.customItems : [],
          hiddenItems: state.hiddenItems || {},
          permanentlyDeleted: state.permanentlyDeleted || {},
          favorites: state.favorites || {},
          catalogPrices: state.catalogPrices || {},
          priceHistory: state.priceHistory || {},
          clients: Array.isArray(state.clients) ? state.clients.map(normalizeClient) : [],
          savedProjects: Array.isArray(state.savedProjects) ? state.savedProjects.map(p => { const n = normalizeSavedProject(p); n.deadline = sanitizeDate(n.deadline); if (n.snapshot && n.snapshot.project) n.snapshot.project.deadline = sanitizeDate(n.snapshot.project.deadline); return n; }) : [],
          tasks: Array.isArray(state.tasks) ? state.tasks.map(t => { const n = normalizeTask(t); n.deadline = sanitizeDate(n.deadline); return n; }) : [],
          payments: Array.isArray(state.payments) ? state.payments.map(normalizePayment) : [],
          expenses: Array.isArray(state.expenses) ? state.expenses.map(normalizeExpense) : [],
          team: Array.isArray(state.team) ? state.team.map(normalizeTeamMember) : [],
          versions: Array.isArray(state.versions) ? state.versions : [],
          stages: Array.isArray(state.stages) && state.stages.length ? state.stages : base.stages,
          packages: Array.isArray(state.packages) && state.packages.length ? state.packages : base.packages,
          contracts: Array.isArray(state.contracts) ? state.contracts : [],
          adminModal: null,
          notifPopupOpen: false,
          notifications: Array.isArray(state.notifications) ? state.notifications : [],
          knowledgeDocs: Array.isArray(state.knowledgeDocs) && state.knowledgeDocs.length ? state.knowledgeDocs : deepClone(DEFAULT_KB_DOCS),
          kbView: state.kbView || "list",
          kbEditId: state.kbEditId || "",
          kbSearch: state.kbSearch || "",
          kbCatFilter: state.kbCatFilter || "all"
        };

        // Sanitize deadline on current project
        if (state.project) state.project.deadline = sanitizeDate(state.project.deadline);

        Object.keys(state.selected).forEach(id => {
          if (!state.estimateOrder.includes(id)) state.estimateOrder.push(id);
        });

        Object.keys(state.selected || {}).forEach(id => {
          const itemData = findItem(id, true);
          const line = state.selected[id];

          if (!itemData || !line) return;

          if (itemData.calcModel === "videoEdit") {
            const rates = getEffectiveRates(itemData);

            if (line.cameraCount === undefined) {
              line.cameraCount = Math.max(1, numberValue(line.sourcePacks, 1));
            }

            if (line.sourceCount === undefined) {
              line.sourceCount = Math.max(1, numberValue(line.sourcePacks, 1));
            }

            if (line.cameraExtraPrice === undefined) {
              line.cameraExtraPrice = rates.sourcePack || 0;
            }

            if (line.sourceExtraPrice === undefined) {
              line.sourceExtraPrice = rates.sourcePack || 0;
            }

            if (line.durationBlockSec === undefined) line.durationBlockSec = 60;
            if (line.includedDurationBlocks === undefined) line.includedDurationBlocks = 1;
            if (line.includedCameras === undefined) line.includedCameras = 1;
            if (line.includedSources === undefined) line.includedSources = 1;
            if (line.includedVersions === undefined) line.includedVersions = 1;
            if (line.includedRevisions === undefined) line.includedRevisions = 1;

            if (line.perMinutePrice === undefined) line.perMinutePrice = rates.perMinute || 0;
            if (line.extraVersionPrice === undefined) line.extraVersionPrice = rates.extraVersion || 0;
            if (line.extraRevisionPrice === undefined) line.extraRevisionPrice = rates.extraRevision || 0;

            if (!line.videoType) line.videoType = itemData.id === "edit_short" ? "reels" : "standard";
            if (!line.complexity) line.complexity = "standard";

            if (!line.urgentMode) line.urgentMode = line.urgent ? "percent" : "none";
            if (line.urgentPercent === undefined) line.urgentPercent = 30;
            if (line.urgentFixed === undefined) line.urgentFixed = 0;
          }
        });

        state.estimateOrder = state.estimateOrder.filter(id => state.selected[id]);
      }

      function load() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          state = defaultState();
          return;
        }

        try {
          state = migrateState(JSON.parse(raw));
          normalizeState();
        } catch {
          state = defaultState();
        }
      }

      function save() {
        if (!isSubscriptionActive()) {
          toast("⛔ Подписка истекла — данные не сохранены. Продлите: adervis.digital@gmail.com");
          return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        scheduleAutoSave();
        broadcastState();
        saveToCloud();
      }

      function setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem(THEME_KEY, theme);
      }

      function toggleTheme() {
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        setTheme(current === "dark" ? "light" : "dark");
      }

      function toast(message) {
        const el = document.getElementById("toast");
        if (!el) return;
        el.textContent = message;
        el.classList.add("show");
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => el.classList.remove("show"), 2200);
      }

      function allItems(includeHidden = false) {
        const items = [...BASE_ITEMS, ...(state.customItems || [])].filter(x => !state.permanentlyDeleted?.[x.id]);
        return includeHidden ? items : items.filter(x => !state.hiddenItems?.[x.id]);
      }

      function findItem(id, includeHidden = true) {
        return allItems(includeHidden).find(x => x.id === id);
      }

      function isHiddenItem(id) {
        return Boolean(state.hiddenItems?.[id]);
      }

      function hiddenItemsList() {
        return allItems(true).filter(x => isHiddenItem(x.id));
      }

      function getCatalogPrice(itemData) {
        if (!itemData) return 0;
        if (state.catalogPrices && Object.prototype.hasOwnProperty.call(state.catalogPrices, itemData.id)) {
          return numberValue(state.catalogPrices[itemData.id], itemData.price);
        }
        return numberValue(itemData.price, 0);
      }

      function isCatalogPriceEdited(itemData) {
        if (!itemData) return false;
        return state.catalogPrices &&
          Object.prototype.hasOwnProperty.call(state.catalogPrices, itemData.id) &&
          numberValue(state.catalogPrices[itemData.id], itemData.price) !== numberValue(itemData.price, 0);
      }

      function getEffectiveRates(itemData) {
        const price = getCatalogPrice(itemData);
        const base = numberValue(itemData.price, 0);
        const ratio = base > 0 ? price / base : 1;
        const rates = deepClone(itemData.rates || {});
        Object.keys(rates).forEach(key => {
          rates[key] = Math.round(numberValue(rates[key], 0) * ratio);
        });
        return rates;
      }

      function money(value) {
        const amount = Math.round(numberValue(value, 0));
        return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(amount) + " " + (state.project.currency || "₽");
      }

      function highlightText(text) {
        const source = escapeHtml(text);
        const q = String(state.search || "").trim();
        if (!q) return source;
        const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return source.replace(new RegExp(`(${safe})`, "gi"), "<mark>$1</mark>");
      }

      function getStage(stageId) {
        return state.stages.find(x => x.id === stageId) || state.stages[0];
      }

      function getItemStageName(itemData) {
        const stage = getStage(itemData?.stage || "pre");
        return stage ? stage.name : "Этап";
      }

      function shouldShowMainDays(itemData) {
        return itemData && (itemData.calcModel === "crewShift" || itemData.calcModel === "perDay");
      }

      function shouldShowMainQty(itemData) {
        return itemData && itemData.calcModel === "fixed+qty";
      }

      function defaultLineForItem(itemData) {
        const price = getCatalogPrice(itemData);
        const rates = getEffectiveRates(itemData);

        const line = {
          id: itemData.id,
          qty: 1,
          price,
          days: numberValue(state.project.days, 1),
          people: 1,
          stageId: itemData.stage || "pre",
          optional: false,
          clientComment: "",
          internalComment: "",

          crewBilling: "shift",
          shiftType: "full",
          hours: 2,
          hourlyRate: rates.hour || Math.round(price / 6),
          overtimeHours: 0,

          rentalDays: numberValue(state.project.days, 1),

          durationPreset: itemData.id === "edit_short" ? "15" : "60",
          customDurationSec: itemData.id === "edit_short" ? 15 : 60,

          sourcePacks: 1,
          sourceCount: 1,
          sourceExtraPrice: rates.sourcePack || 0,

          cameraCount: 1,
          cameraExtraPrice: rates.sourcePack || 0,

          durationBlockSec: 60,
          includedDurationBlocks: 1,
          includedCameras: 1,
          includedSources: 1,
          includedVersions: 1,
          includedRevisions: 1,

          perMinutePrice: rates.perMinute || 0,
          extraVersionPrice: rates.extraVersion || 0,
          extraRevisionPrice: rates.extraRevision || 0,

          videoType: itemData.id === "edit_short" ? "reels" : "standard",
          complexity: "standard",

          extraVersions: 0,
          extraRevisions: 0,

          urgent: false,
          urgentMode: "none",
          urgentPercent: 30,
          urgentFixed: 0,

          creativeLevel: "standard",
          iterations: 0,

          editedDesc: "",
          lineName: ""
        };

        if (itemData.calcModel === "fixed+qty") {
          line.qty = itemData.category === "photo" ? 10 : 1;
        }

        if (itemData.calcModel === "crewShift" || itemData.calcModel === "perDay") {
          line.days = 1;
        }

        if (itemData.calcModel === "equipmentRental") {
          line.rentalDays = numberValue(state.project.days, 1);
        }

        return line;
      }

      function selectedIds() {
        const existing = Object.keys(state.selected || {});
        const ordered = (state.estimateOrder || []).filter(id => state.selected[id]);
        const missing = existing.filter(id => !ordered.includes(id));
        return [...ordered, ...missing];
      }

      function selectedIdsByStage(stageId, includeOptional = true) {
        return selectedIds().filter(id => {
          const itemData = findItem(id);
          const line = state.selected[id];
          if (!itemData || !line) return false;
          if (!includeOptional && line.optional) return false;
          return (line.stageId || itemData.stage) === stageId;
        });
      }

      function durationPresetToMinutes(line) {
        if (line.durationPreset === "15") return 0.25;
        if (line.durationPreset === "30") return 0.5;
        if (line.durationPreset === "60") return 1;
        if (line.durationPreset === "120") return 2;
        const seconds = numberValue(line.customDurationSec, 60);
        return Math.max(0.1, seconds / 60);
      }

      function creativeFactor(value) {
        return ({ simple: .75, standard: 1, advanced: 1.45, premium: 2 }[value]) || 1;
      }

      function durationPresetToSeconds(line) {
        if (line.durationPreset === "15") return 15;
        if (line.durationPreset === "30") return 30;
        if (line.durationPreset === "60") return 60;
        if (line.durationPreset === "120") return 120;
        if (line.durationPreset === "300") return 300;
        if (line.durationPreset === "600") return 600;
        if (line.durationPreset === "900") return 900;
        if (line.durationPreset === "1200") return 1200;

        const seconds = numberValue(line.customDurationSec, 60);
        return Math.max(1, seconds);
      }

      function durationPaidBlocks(line) {
        const seconds = durationPresetToSeconds(line);
        const blockSec = Math.max(1, numberValue(line.durationBlockSec, 60));
        return Math.max(1, Math.ceil(seconds / blockSec));
      }

      function videoComplexityFactor(value) {
        return ({
          simple: .85,
          standard: 1,
          advanced: 1.35,
          premium: 1.7,
          advertising: 2
        }[value]) || 1;
      }

      function videoTypeLabel(value) {
        return ({
          standard: "Стандартный ролик",
          reels: "Reels / Shorts",
          interview: "Интервью",
          event: "Мероприятие",
          ad: "Рекламный ролик",
          education: "Обучающее видео"
        }[value]) || "Стандартный ролик";
      }

      function complexityLabel(value) {
        return ({
          simple: "Простая",
          standard: "Стандарт",
          advanced: "Сложная",
          premium: "Премиум",
          advertising: "Рекламная"
        }[value]) || "Стандарт";
      }

      function urgentLabel(line) {
        const mode = line.urgentMode || (line.urgent ? "percent" : "none");
        if (mode === "percent") return `Срочность +${Math.max(0, numberValue(line.urgentPercent, 30))}%`;
        if (mode === "fixed") return `Срочность фикс. ${money(Math.max(0, numberValue(line.urgentFixed, 0)))}`;
        return "Без срочности";
      }

      function addBreakdownRow(rows, label, value, note = "") {
        const amount = numberValue(value, 0);
        if (!amount) return;
        rows.push({ label, value: amount, note });
      }

      function lineBreakdown(id) {
        const itemData = findItem(id);
        const line = state.selected[id];

        if (!itemData || !line) {
          return { total: 0, rows: [], warnings: [], formula: "" };
        }

        const rows = [];
        const warnings = [];

        let price = Math.max(0, numberValue(line.price, getCatalogPrice(itemData)));
        const qty = Math.max(0, numberValue(line.qty, 1));
        let total = price;

        if (itemData.calcModel === "crewShift") {
          const rates = getEffectiveRates(itemData);
          const people = Math.max(1, numberValue(line.people, 1));

          if (line.crewBilling === "hour") {
            const hourlyRate = Math.max(0, numberValue(line.hourlyRate, rates.hour || 0));
            const hours = Math.max(0, numberValue(line.hours, 0));
            total = hourlyRate * hours * people;

            addBreakdownRow(rows, "Почасовая работа", total, `${hours} ч × ${money(hourlyRate)} × ${people} чел.`);
          } else {
            const days = Math.max(1, numberValue(line.days, 1));
            const shiftPrice = Math.max(0, numberValue(line.price, rates[line.shiftType] || price));
            const overtimeHours = Math.max(0, numberValue(line.overtimeHours, 0));
            const overtimeRate = Math.max(0, numberValue(rates.overtimeHour, 0));
            const overtime = overtimeHours * overtimeRate;
            const daySubtotal = shiftPrice + overtime;

            total = daySubtotal * days * people;

            addBreakdownRow(rows, "Смена", shiftPrice * days * people, `${money(shiftPrice)} × ${days} дн. × ${people} чел.`);
            addBreakdownRow(rows, "Сверхурочно", overtime * days * people, `${overtimeHours} ч × ${money(overtimeRate)} × ${days} дн. × ${people} чел.`);
          }
        } else if (itemData.calcModel === "equipmentRental") {
          const rates = getEffectiveRates(itemData);
          const dayPrice = Math.max(0, numberValue(line.price, rates.day || price));
          const rentalDays = Math.max(1, numberValue(line.rentalDays, 1));
          const kits = Math.max(1, qty);

          total = dayPrice * rentalDays * kits;
          addBreakdownRow(rows, "Аренда техники", total, `${money(dayPrice)} × ${rentalDays} дн. × ${kits} компл.`);
        } else if (itemData.calcModel === "videoEdit") {
          const rates = getEffectiveRates(itemData);

          const basePrice = Math.max(0, numberValue(line.price, rates.base || price));
          const durationBlocks = durationPaidBlocks(line);
          const includedDurationBlocks = Math.max(0, numberValue(line.includedDurationBlocks, 1));
          const extraDurationBlocks = Math.max(0, durationBlocks - includedDurationBlocks);
          const perBlockPrice = Math.max(0, numberValue(line.perMinutePrice, rates.perMinute || 0));

          const cameraCount = Math.max(1, numberValue(line.cameraCount, 1));
          const includedCameras = Math.max(0, numberValue(line.includedCameras, 1));
          const cameraExtraPrice = Math.max(0, numberValue(line.cameraExtraPrice, rates.sourcePack || 0));
          const extraCameras = Math.max(0, cameraCount - includedCameras);

          const sourceCount = Math.max(1, numberValue(line.sourceCount, numberValue(line.sourcePacks, 1)));
          const includedSources = Math.max(0, numberValue(line.includedSources, 1));
          const sourceExtraPrice = Math.max(0, numberValue(line.sourceExtraPrice, rates.sourcePack || 0));
          const extraSources = Math.max(0, sourceCount - includedSources);

          const extraVersions = Math.max(0, numberValue(line.extraVersions, 0));
          const extraVersionPrice = Math.max(0, numberValue(line.extraVersionPrice, rates.extraVersion || 0));

          const extraRevisions = Math.max(0, numberValue(line.extraRevisions, 0));
          const extraRevisionPrice = Math.max(0, numberValue(line.extraRevisionPrice, rates.extraRevision || 0));

          const durationExtra = extraDurationBlocks * perBlockPrice;
          const cameraExtra = extraCameras * cameraExtraPrice;
          const sourceExtra = extraSources * sourceExtraPrice;
          const versionExtra = extraVersions * extraVersionPrice;
          const revisionExtra = extraRevisions * extraRevisionPrice;

          const beforeComplexity = basePrice + durationExtra + cameraExtra + sourceExtra + versionExtra + revisionExtra;
          const factor = videoComplexityFactor(line.complexity);
          const complexityExtra = beforeComplexity * (factor - 1);
          let subtotal = beforeComplexity + complexityExtra;

          const urgentMode = line.urgentMode || (line.urgent ? "percent" : "none");
          let urgentExtra = 0;

          if (urgentMode === "percent") {
            urgentExtra = subtotal * Math.max(0, numberValue(line.urgentPercent, 30)) / 100;
          } else if (urgentMode === "fixed") {
            urgentExtra = Math.max(0, numberValue(line.urgentFixed, 0));
          }

          total = subtotal + urgentExtra;

          rows.push({
            label: "База монтажа",
            value: basePrice,
            note: `${videoTypeLabel(line.videoType)} · ${complexityLabel(line.complexity)}`
          });

          addBreakdownRow(rows, "Доп. длительность", durationExtra, `${extraDurationBlocks} блок(ов) × ${money(perBlockPrice)}`);
          addBreakdownRow(rows, "Доп. камеры", cameraExtra, `${extraCameras} × ${money(cameraExtraPrice)}`);
          addBreakdownRow(rows, "Доп. исходники", sourceExtra, `${extraSources} × ${money(sourceExtraPrice)}`);
          addBreakdownRow(rows, "Доп. версии", versionExtra, `${extraVersions} × ${money(extraVersionPrice)}`);
          addBreakdownRow(rows, "Доп. правки", revisionExtra, `${extraRevisions} × ${money(extraRevisionPrice)}`);
          addBreakdownRow(rows, "Сложность", complexityExtra, `Коэффициент ×${factor}`);
          addBreakdownRow(rows, "Срочность", urgentExtra, urgentLabel(line));

          if (durationBlocks <= includedDurationBlocks) warnings.push("Длительность входит в базовый лимит.");
          if (cameraCount <= includedCameras) warnings.push("Камеры входят в базовый лимит.");
          if (sourceCount <= includedSources) warnings.push("Исходники входят в базовый лимит.");
        } else if (itemData.calcModel === "creativeWork") {
          const factor = creativeFactor(line.creativeLevel);
          const base = price * factor;
          const iterations = Math.max(0, numberValue(line.iterations, 0));
          const iterationPrice = Math.max(800, base * .12);
          const iterationExtra = iterations * iterationPrice;

          total = base + iterationExtra;

          addBreakdownRow(rows, "Креативная работа", base, `Коэффициент ×${factor}`);
          addBreakdownRow(rows, "Доп. итерации", iterationExtra, `${iterations} × ${money(iterationPrice)}`);
        } else if (itemData.calcModel === "perDay") {
          const days = Math.max(1, numberValue(line.days, 1));
          total = price * days;
          addBreakdownRow(rows, "Расчёт по дням", total, `${money(price)} × ${days} дн.`);
        } else if (itemData.calcModel === "fixed+qty") {
          total = price * qty;
          addBreakdownRow(rows, "Количество", total, `${money(price)} × ${qty}`);
        } else {
          total = price;
          addBreakdownRow(rows, "Фиксированная стоимость", total, "");
        }

        total = Math.max(0, total);

        return {
          total,
          rows,
          warnings,
          formula: rows.map(row => `${row.label}: ${money(row.value)}${row.note ? ` (${row.note})` : ""}`).join("; ")
        };
      }

      function lineBreakdownText(id) {
        const breakdown = lineBreakdown(id);
        return breakdown.formula || "";
      }

      function lineTotal(id) {
        return lineBreakdown(id).total;
      }

      function totals() {
        let base = 0;
        let optional = 0;

        selectedIds().forEach(id => {
          const sum = lineTotal(id);
          if (state.selected[id]?.optional) optional += sum;
          else base += sum;
        });

        const discount = base * Math.max(0, numberValue(state.project.discount, 0)) / 100;
        const afterDiscount = Math.max(0, base - discount);
        const tax = afterDiscount * taxRateByType(state.project.taxType);
        const total = afterDiscount + tax;

        return { base, optional, discount, afterDiscount, tax, total, withOptional: total + optional };
      }

      function financeTotals() {
        const t = totals();
        const paid = (state.payments || []).reduce((sum, payment) => sum + numberValue(payment.amount, 0), 0);
        const expenses = (state.expenses || []).reduce((sum, expense) => sum + numberValue(expense.amount, 0), 0);
        const teamPayouts = (state.team || []).reduce((sum, member) => sum + numberValue(member.payout, 0), 0);
        const totalExpenses = expenses + teamPayouts;
        const debt = Math.max(0, t.total - paid);
        const profit = t.total - totalExpenses;
        const margin = t.total > 0 ? profit / t.total * 100 : 0;

        return { estimateTotal: t.total, withOptional: t.withOptional, paid, debt, expenses, teamPayouts, totalExpenses, profit, margin };
      }

      function stageTotal(stageId, includeOptional = false) {
        return selectedIdsByStage(stageId, true).reduce((sum, id) => {
          const line = state.selected[id];
          if (!includeOptional && line?.optional) return sum;
          return sum + lineTotal(id);
        }, 0);
      }

      function getPackageItems(pkg) {
        return (pkg.items || []).map(id => findItem(id, true)).filter(Boolean);
      }

      function packageApproxTotal(pkg) {
        return getPackageItems(pkg).reduce((sum, itemData) => sum + getCatalogPrice(itemData), 0);
      }

      function filteredItems() {
        let items = state.tab === "hidden" ? hiddenItemsList() : allItems(false);

        if (state.tab !== "all") {
          if (state.tab === "favorites") items = items.filter(x => state.favorites[x.id]);
          else if (state.tab === "custom") items = items.filter(x => x.category === "custom");
          else if (state.tab !== "hidden") items = items.filter(x => x.category === state.tab);
        }

        const query = String(state.search || "").trim().toLowerCase();
        if (query) {
          items = items.filter(x => [x.name, x.desc, x.category, x.section, x.calcModel, x.unit, ...(x.tags || [])].join(" ").toLowerCase().includes(query));
        }

        if (state.filter === "selected") items = items.filter(x => state.selected[x.id]);
        if (state.filter === "edited") items = items.filter(x => isCatalogPriceEdited(x));
        if (state.filter === "hourly") items = items.filter(x => x.calcModel === "crewShift");

        if (state.sort === "name") items.sort((a, b) => a.name.localeCompare(b.name, "ru"));
        if (state.sort === "priceAsc") items.sort((a, b) => getCatalogPrice(a) - getCatalogPrice(b));
        if (state.sort === "priceDesc") items.sort((a, b) => getCatalogPrice(b) - getCatalogPrice(a));
        if (state.sort === "category") items.sort((a, b) => String(a.category).localeCompare(String(b.category), "ru"));

        return items;
      }

      function getClientById(id) {
        return (state.clients || []).find(client => client.id === id);
      }

      function getCurrentClient() {
        return getClientById(state.project.clientId || state.activeClientId);
      }

      function createClientFromProject() {
        const name = String(state.project.client || "").trim();
        if (!name) {
          toast("Укажи имя клиента в проекте");
          return null;
        }

        const existing = state.clients.find(client => client.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          state.project.clientId = existing.id;
          state.activeClientId = existing.id;
          save();
          return existing;
        }

        const client = normalizeClient({ name, city: state.project.city || "", source: state.project.source || "" });
        state.clients.unshift(client);
        state.project.clientId = client.id;
        state.activeClientId = client.id;
        save();
        return client;
      }

      function currentProjectSnapshot() {
        const t = totals();
        const f = financeTotals();

        return {
          project: deepClone(state.project),
          selected: deepClone(state.selected),
          estimateOrder: deepClone(state.estimateOrder),
          lineCollapsed: deepClone(state.lineCollapsed),
          stageCollapsed: deepClone(state.stageCollapsed),
          customItems: deepClone(state.customItems),
          catalogPrices: deepClone(state.catalogPrices),
          hiddenItems: deepClone(state.hiddenItems),
          stages: deepClone(state.stages),
          versions: deepClone(state.versions),
          tasks: deepClone(state.tasks),
          payments: deepClone(state.payments),
          expenses: deepClone(state.expenses),
          team: deepClone(state.team),
          total: t.total,
          optionalTotal: t.optional,
          withOptional: t.withOptional,
          paid: f.paid,
          debt: f.debt,
          expensesTotal: f.totalExpenses,
          profit: f.profit
        };
      }

      function saveCurrentProject() {
        const snapshot = currentProjectSnapshot();
        const now = new Date().toISOString();
        const f = financeTotals();

        if (state.project.client && !state.project.clientId) {
          createClientFromProject();
          snapshot.project = deepClone(state.project);
        }

        if (state.activeProjectId) {
          const existing = state.savedProjects.find(p => p.id === state.activeProjectId);
          if (existing) {
            Object.assign(existing, {
              name: state.project.name || "Проект",
              client: state.project.client || "",
              clientId: state.project.clientId || "",
              status: state.project.status || "Черновик",
              crmStatus: state.project.crmStatus || "Лид",
              priority: state.project.priority || "Средний",
              deadline: state.project.deadline || "",
              city: state.project.city || "",
              total: snapshot.total,
              paid: f.paid,
              debt: f.debt,
              expensesTotal: f.totalExpenses,
              profit: f.profit,
              updatedAt: now,
              snapshot
            });
            toast("Проект обновлён");
            save();
            render();
            return existing;
          }
        }

        const id = state.project.id || uid("project");
        state.project.id = id;

        const saved = normalizeSavedProject({
          id,
          name: state.project.name || "Проект",
          client: state.project.client || "",
          clientId: state.project.clientId || "",
          status: state.project.status || "Черновик",
          crmStatus: state.project.crmStatus || "Лид",
          priority: state.project.priority || "Средний",
          deadline: state.project.deadline || "",
          city: state.project.city || "",
          total: snapshot.total,
          paid: f.paid,
          debt: f.debt,
          expensesTotal: f.totalExpenses,
          profit: f.profit,
          createdAt: state.project.createdAt || now,
          updatedAt: now,
          snapshot
        });

        state.savedProjects.unshift(saved);
        state.activeProjectId = saved.id;
        state.project.createdAt = saved.createdAt;

        toast("Проект сохранён");
        save();
        render();
        return saved;
      }

      function loadSavedProject(id) {
        const saved = state.savedProjects.find(project => project.id === id);
        if (!saved) return;

        if (selectedIds().length && !confirm("Открыть сохранённый проект? Текущие несохранённые изменения могут быть потеряны.")) return;

        const snapshot = saved.snapshot || {};

        state.project = {
          ...state.project,
          ...(snapshot.project || {}),
          id: saved.id,
          name: saved.name || snapshot.project?.name || state.project.name,
          client: saved.client || snapshot.project?.client || "",
          clientId: saved.clientId || snapshot.project?.clientId || "",
          status: saved.status || snapshot.project?.status || "Черновик",
          crmStatus: saved.crmStatus || snapshot.project?.crmStatus || "Лид",
          priority: saved.priority || snapshot.project?.priority || "Средний",
          deadline: saved.deadline || snapshot.project?.deadline || "",
          city: saved.city || snapshot.project?.city || ""
        };

        state.selected = deepClone(snapshot.selected || {});
        state.estimateOrder = deepClone(snapshot.estimateOrder || Object.keys(state.selected));
        state.lineCollapsed = deepClone(snapshot.lineCollapsed || {});
        state.stageCollapsed = deepClone(snapshot.stageCollapsed || {});
        state.customItems = deepClone(snapshot.customItems || state.customItems || []);
        state.catalogPrices = deepClone(snapshot.catalogPrices || state.catalogPrices || {});
        state.hiddenItems = deepClone(snapshot.hiddenItems || state.hiddenItems || {});
        state.stages = deepClone(snapshot.stages || state.stages || DEFAULT_STAGES);
        state.versions = deepClone(snapshot.versions || state.versions || []);
        state.tasks = deepClone(snapshot.tasks || []);
        state.payments = deepClone(snapshot.payments || []);
        state.expenses = deepClone(snapshot.expenses || []);
        state.team = deepClone(snapshot.team || []);
        state.activeProjectId = saved.id;
        state.activeClientId = state.project.clientId || "";
        state.view = "deal";
        state.dealView = "estimate";

        toast("Проект загружен");
        save();
        render();
      }

      function duplicateSavedProject(id) {
        const saved = state.savedProjects.find(project => project.id === id);
        if (!saved) return;

        const copy = normalizeSavedProject(deepClone(saved));
        copy.id = uid("project");
        copy.name = `${saved.name || "Проект"} — копия`;
        copy.createdAt = new Date().toISOString();
        copy.updatedAt = copy.createdAt;

        if (copy.snapshot?.project) {
          copy.snapshot.project.id = copy.id;
          copy.snapshot.project.name = copy.name;
        }

        state.savedProjects.unshift(copy);
        toast("Проект скопирован");
        save();
        render();
      }

      function deleteSavedProject(id) {
        if (!confirm("Удалить сохранённый проект?")) return;
        state.savedProjects = state.savedProjects.filter(project => project.id !== id);
        if (state.activeProjectId === id) state.activeProjectId = "";
        toast("Проект удалён");
        save();
        render();
      }

      function deleteDealFromModal(id) {
        const proj = (state.savedProjects || []).find(p => p.id === id);
        const name = (proj && proj.name) || "эту сделку";
        if (!confirm(`Удалить сделку «${name}»? Это действие нельзя отменить.`)) return;
        state.dealModal = null;
        state.savedProjects = state.savedProjects.filter(p => p.id !== id);
        if (state.activeProjectId === id) state.activeProjectId = "";
        toast("Сделка удалена");
        save();
        render();
      }

      function newProject() {
        if (selectedIds().length && !confirm("Создать новый проект? Текущая несохранённая смета будет очищена.")) return;

        const keep = {
          company: deepClone(state.company),
          clients: deepClone(state.clients),
          savedProjects: deepClone(state.savedProjects),
          catalogPrices: deepClone(state.catalogPrices),
          priceHistory: deepClone(state.priceHistory),
          customItems: deepClone(state.customItems),
          hiddenItems: deepClone(state.hiddenItems),
          favorites: deepClone(state.favorites),
          packages: deepClone(state.packages),
          stages: deepClone(state.stages)
        };

        const fresh = defaultState();
        state = { ...fresh, ...keep, view: "estimate", project: { ...fresh.project } };

        toast("Создан новый проект");
        save();
        render();
      }

      function addItem(id) {
        const itemData = findItem(id, true);
        if (!itemData) return;

        saveHistory();
        if (!state.selected[id]) {
          state.selected[id] = defaultLineForItem(itemData);
          if (!state.estimateOrder.includes(id)) state.estimateOrder.push(id);
          state.recentlyAdded = id;
          toast("Позиция добавлена в смету");
        } else {
          toast("Позиция уже есть в смете");
        }

        save();
        render();
      }

      function removeItem(id) {
        saveHistory();
        delete state.selected[id];
        state.estimateOrder = state.estimateOrder.filter(x => x !== id);
        delete state.lineCollapsed[id];
        save();
        render();
      }

      function duplicateEstimateLine(id) {
        const itemData = findItem(id, true);
        const line = state.selected[id];
        if (!itemData || !line) return;

        const newId = uid("custom_line");
        const customItem = deepClone(itemData);
        customItem.id = newId;
        customItem.name = `${itemData.name} — копия`;
        customItem.category = itemData.category || "custom";
        customItem.section = itemData.section || CAT.custom;
        customItem.tags = [...(itemData.tags || []), "копия"];
        customItem.price = numberValue(line.price, getCatalogPrice(itemData));

        state.customItems.unshift(customItem);
        state.selected[newId] = {
          ...deepClone(line),
          id: newId
        };

        const index = state.estimateOrder.indexOf(id);
        if (index >= 0) {
          state.estimateOrder.splice(index + 1, 0, newId);
        } else {
          state.estimateOrder.push(newId);
        }

        toast("Позиция продублирована");
        save();
        render();
      }

      function duplicateToCustom(id) {
        const itemData = findItem(id, true);
        if (!itemData) return;

        const copy = deepClone(itemData);
        copy.id = uid("custom");
        copy.name = `${copy.name} — копия`;
        copy.category = "custom";
        copy.section = CAT.custom;
        copy.tags = [...(copy.tags || []), "копия", "своя позиция"];
        copy.price = getCatalogPrice(itemData);

        state.customItems.unshift(copy);
        state.tab = "custom";
        toast("Позиция скопирована в свои");
        save();
        render();
      }

      function hideCatalogItem(id) {
        saveHistory();
        state.hiddenItems[id] = true;
        if (state.selected[id]) {
          delete state.selected[id];
          state.estimateOrder = state.estimateOrder.filter(x => x !== id);
        }
        toast("Позиция скрыта");
        save();
        render();
      }

      function restoreCatalogItem(id) {
        delete state.hiddenItems[id];
        toast("Позиция восстановлена");
        save();
        render();
      }

      function permanentlyDeleteItem(id) {
        if (!confirm("Удалить позицию навсегда? Она исчезнет даже из вкладки «Скрытые».")) return;
        saveHistory();
        const isCustom = state.customItems.some(x => x.id === id);
        if (isCustom) {
          state.customItems = state.customItems.filter(x => x.id !== id);
        } else {
          if (!state.permanentlyDeleted) state.permanentlyDeleted = {};
          state.permanentlyDeleted[id] = true;
        }
        delete state.hiddenItems[id];
        delete state.selected[id];
        state.estimateOrder = state.estimateOrder.filter(x => x !== id);
        toast("Позиция удалена навсегда");
        save();
        render();
      }

      function toggleFavorite(id) {
        state.favorites[id] = !state.favorites[id];
        if (!state.favorites[id]) delete state.favorites[id];
        save();
        render();
      }

      function toggleOptional(id) {
        if (!state.selected[id]) return;
        saveHistory();
        state.selected[id].optional = !state.selected[id].optional;
        save();
        render();
      }

      function toggleLineCollapse(id) {
        state.lineCollapsed[id] = !state.lineCollapsed[id];
        if (!state.lineCollapsed[id]) delete state.lineCollapsed[id];
        save();
        render();
      }

      function toggleStageCollapse(stageId) {
        state.stageCollapsed[stageId] = !state.stageCollapsed[stageId];
        if (!state.stageCollapsed[stageId]) delete state.stageCollapsed[stageId];
        save();
        render();
      }

      function collapseAllEstimate() {
        const lines = {};
        selectedIds().forEach(id => {
          lines[id] = true;
        });
        state.lineCollapsed = lines;

        const stages = {};
        state.stages.forEach(stage => {
          if (selectedIdsByStage(stage.id, true).length) stages[stage.id] = true;
        });
        state.stageCollapsed = stages;

        save();
        render();
      }

      function expandAllEstimate() {
        state.lineCollapsed = {};
        state.stageCollapsed = {};
        save();
        render();
      }

      function toggleAllEstimate() {
        const stagesWithItems = state.stages.filter(stage => selectedIdsByStage(stage.id, true).length);
        const allCollapsed = stagesWithItems.length > 0 && stagesWithItems.every(stage => state.stageCollapsed?.[stage.id]);
        if (allCollapsed) expandAllEstimate(); else collapseAllEstimate();
      }

      function toggleSummary() {
        state.summaryOpen = !state.summaryOpen;
        render();
      }

      function updateLine(id, key, value) {
        if (!state.selected[id]) return;

        saveHistory();
        const numericKeys = [
          "qty",
          "price",
          "days",
          "people",
          "hours",
          "hourlyRate",
          "overtimeHours",
          "rentalDays",
          "customDurationSec",
          "sourcePacks",
          "sourceCount",
          "sourceExtraPrice",
          "cameraCount",
          "cameraExtraPrice",
          "durationBlockSec",
          "includedDurationBlocks",
          "includedCameras",
          "includedSources",
          "includedVersions",
          "includedRevisions",
          "perMinutePrice",
          "extraVersionPrice",
          "extraRevisionPrice",
          "extraVersions",
          "extraRevisions",
          "urgentPercent",
          "urgentFixed",
          "iterations" 

        ];

        const booleanKeys = ["urgent"];

        if (numericKeys.includes(key)) state.selected[id][key] = numberValue(value, 0);
        else if (booleanKeys.includes(key)) state.selected[id][key] = Boolean(value);
        else state.selected[id][key] = value;

        if (key === "shiftType") {
          const itemData = findItem(id, true);
          if (itemData && itemData.calcModel === "crewShift") {
            const rates = getEffectiveRates(itemData);
            const newRate = rates[value];
            if (newRate) state.selected[id].price = newRate;
          }
        }

        save();
        render();
      }

      function updateCatalogPrice(id, value) {
        const itemData = findItem(id, true);
        if (!itemData) return;

        const nextPrice = Math.max(0, Math.round(numberValue(value, itemData.price)));
        const oldPrice = getCatalogPrice(itemData);

        if (!state.priceHistory[id]) state.priceHistory[id] = [];
        if (oldPrice !== nextPrice) {
          const reason = prompt("Причина изменения цены:", "") || "";
          state.priceHistory[id].push({
            at: new Date().toISOString(),
            from: oldPrice,
            to: nextPrice,
            reason
          });
        }

        if (nextPrice === numberValue(itemData.price, 0)) delete state.catalogPrices[id];
        else state.catalogPrices[id] = nextPrice;

        if (state.selected[id]) {
          state.selected[id].price = nextPrice;
          if (itemData.calcModel === "crewShift") {
            const rates = getEffectiveRates(itemData);
            state.selected[id].hourlyRate = rates.hour || state.selected[id].hourlyRate;
          }
        }

        save();
        render();
      }

      function resetCatalogPrice(id) {
        const itemData = findItem(id, true);
        if (!itemData) return;

        delete state.catalogPrices[id];

        if (state.selected[id]) {
          state.selected[id].price = numberValue(itemData.price, 0);
          if (itemData.calcModel === "crewShift") {
            const rates = getEffectiveRates(itemData);
            state.selected[id].hourlyRate = rates.hour || Math.round(itemData.price / 6);
          }
        }

        toast("Цена сброшена к базе");
        save();
        render();
      }

      function updateProject(key, value) {
        const numericKeys = ["days", "discount"];
        state.project[key] = numericKeys.includes(key) ? numberValue(value, 0) : value;
        if (key === "client") state.project.clientId = "";
        save();
        render();
      }

      function updateCompany(key, value) {
        state.company[key] = value;
        save();
        render();
      }

      function createVersion() {
        const defaultName = `Версия от ${formatDate(new Date().toISOString())}`;
        const name = prompt("Название версии:", defaultName);
        if (!name) return;

        const t = totals();

        state.versions.unshift({
          id: uid("version"),
          at: new Date().toISOString(),
          name,
          total: t.total,
          selected: deepClone(state.selected),
          estimateOrder: deepClone(state.estimateOrder),
          lineCollapsed: deepClone(state.lineCollapsed),
          stageCollapsed: deepClone(state.stageCollapsed),
          project: deepClone(state.project),
          tasks: deepClone(state.tasks),
          payments: deepClone(state.payments),
          expenses: deepClone(state.expenses),
          team: deepClone(state.team)
        });

        toast("Версия сохранена");
        save();
        render();
      }

      function restoreVersion(id) {
        const version = state.versions.find(x => x.id === id);
        if (!version) return;
        if (!confirm("Восстановить эту версию сметы?")) return;

        state.selected = deepClone(version.selected || {});
        state.estimateOrder = deepClone(version.estimateOrder || Object.keys(state.selected));
        state.lineCollapsed = deepClone(version.lineCollapsed || {});
        state.stageCollapsed = deepClone(version.stageCollapsed || {});
        state.project = { ...state.project, ...(version.project || {}) };
        state.tasks = deepClone(version.tasks || state.tasks || []);
        state.payments = deepClone(version.payments || state.payments || []);
        state.expenses = deepClone(version.expenses || state.expenses || []);
        state.team = deepClone(version.team || state.team || []);
        state.view = "estimate";

        toast("Версия восстановлена");
        save();
        render();
      }

      function deleteVersion(id) {
        if (!confirm("Удалить версию?")) return;
        state.versions = state.versions.filter(x => x.id !== id);
        save();
        render();
      }

      function clearEstimate() {
        if (!confirm("Очистить смету?")) return;
        saveHistory();
        state.selected = {};
        state.estimateOrder = [];
        state.lineCollapsed = {};
        state.stageCollapsed = {};
        toast("Смета очищена");
        save();
        render();
      }

      function resetAllData() {
        if (!confirm("Сбросить все данные приложения?")) return;
        if (!confirm("Точно? Будут удалены проекты, клиенты, цены и настройки.")) return;
        state = defaultState();
        localStorage.removeItem(STORAGE_KEY);
        save();
        render();
        toast("Данные сброшены");
      }

      function createCustomItem() {
        const custom = {
          id: uid("custom"),
          category: "custom",
          section: CAT.custom,
          name: "Новая позиция",
          desc: "Описание новой позиции.",
          calcModel: "fixed",
          price: 1000,
          unit: "шт",
          tags: ["своя позиция"],
          stage: "pre",
          rates: {}
        };

        state.customItems.unshift(custom);
        state.tab = "custom";
        save();
        render();
      }

      function updateCustomItem(id, key, value) {
        const custom = state.customItems.find(x => x.id === id);
        if (!custom) return;

        if (key === "price") custom[key] = Math.max(0, Math.round(numberValue(value, 0)));
        else if (key === "tags") custom.tags = String(value || "").split(",").map(x => x.trim()).filter(Boolean);
        else if (key === "category") {
          custom.category = value;
          custom.section = CAT[value] || value;
        } else custom[key] = value;

        if (state.selected[id]) {
          if (key === "price") state.selected[id].price = custom.price;
          if (key === "stage") state.selected[id].stageId = value;
        }

        save();
        render();
      }

      function deleteCustomItem(id) {
        if (!confirm("Удалить свою позицию?")) return;
        state.customItems = state.customItems.filter(x => x.id !== id);
        delete state.selected[id];
        state.estimateOrder = state.estimateOrder.filter(x => x !== id);
        save();
        render();
      }

      function applyPackage(pkgId) {
        const pkg = (state.packages || DEFAULT_PACKAGES).find(x => x.id === pkgId);
        if (!pkg) return;

        saveHistory();
        (pkg.items || []).forEach(id => {
          const itemData = findItem(id, true);
          if (itemData && !state.selected[id]) {
            state.selected[id] = defaultLineForItem(itemData);
            if (!state.estimateOrder.includes(id)) state.estimateOrder.push(id);
          }
        });

        state.view = state.activeProjectId ? "deal" : "estimate";
        toast(`Пакет «${pkg.name}» добавлен`);
        save();
        render();
      }

      function createPackage() {
        const name = prompt("Название нового пакета:");
        if (!name) return;

        const ids = selectedIds();
        if (!ids.length) {
          toast("Сначала добавь позиции в смету");
          return;
        }

        state.packages.unshift({
          id: uid("package"),
          name,
          priceLabel: "Свой пакет",
          desc: "Пользовательский пакет из текущей сметы.",
          goodFor: "Индивидуальные проекты",
          items: ids,
          notes: ["Пакет создан из текущей сметы."]
        });

        toast("Пакет создан");
        save();
        render();
      }

      function deletePackage(id) {
        if (!id.startsWith("package_")) return;
        if (!confirm("Удалить этот пакет?")) return;
        state.packages = state.packages.filter(p => p.id !== id);
        toast("Пакет удалён");
        save();
        render();
      }

      function createClient() {
        state.clientDraft = {
          id: "",
          name: "",
          company: "",
          phone: "",
          email: "",
          city: state.project.city || "",
          source: state.project.source || "",
          requisites: "",
          status: "new",
          note: ""
        };
        save();
        render();
      }

      function editClient(id) {
        const client = (state.clients || []).find(x => x.id === id);
        if (!client) return;
        state.clientDraft = deepClone(client);
        save();
        render();
      }

      function updateClientDraft(key, value) {
        if (!state.clientDraft) return;
        state.clientDraft[key] = value;
        save();
      }

      function saveClientDraft() {
        if (!state.clientDraft) return;

        if (state.clientDraft.phone && !validatePhone(state.clientDraft.phone)) {
          toast("❌ Неверный формат телефона. Пример: +7 900 000-00-00");
          return;
        }

        const draft = normalizeClient({
          ...state.clientDraft,
          name: String(state.clientDraft.name || "").trim() || "Новый клиент",
          updatedAt: new Date().toISOString()
        });

        if (!state.clientDraft.id) {
          draft.id = uid("client");
          draft.createdAt = new Date().toISOString();
          state.clients.unshift(draft);
        } else {
          const idx = state.clients.findIndex(x => x.id === draft.id);
          if (idx >= 0) state.clients[idx] = { ...state.clients[idx], ...draft };
          else state.clients.unshift(draft);
        }

        state.project.client = draft.name;
        state.project.clientId = draft.id;
        state.activeClientId = draft.id;
        state.clientDraft = null;

        toast("Клиент сохранён");
        save();
        render();
      }

      function cancelClientDraft() {
        state.clientDraft = null;
        save();
        render();
      }

      function editClientFromDeal(projectId, clientId, clientName) {
        // Find or create client
        let client = clientId ? (state.clients || []).find(c => c.id === clientId) : null;
        if (!client && clientName) client = (state.clients || []).find(c => c.name === clientName);
        if (!client) {
          client = normalizeClient({ name: clientName || "" });
          state.clients = [...(state.clients || []), client];
          save();
        }
        // Find project deadline
        const project = (state.savedProjects || []).find(p => p.id === projectId);
        state.clientModal = {
          ...deepClone(client),
          _projectId: projectId || "",
          _projectDeadline: project ? (project.deadline || "") : ""
        };
        renderModal();
      }

      function selectClient(id) {
        const client = (state.clients || []).find(x => x.id === id);
        if (!client) return;

        state.project.client = client.name || "";
        state.project.clientId = client.id;
        state.project.city = client.city || state.project.city || "";
        state.activeClientId = client.id;

        toast("Клиент выбран для проекта");
        save();
        render();
      }

      function deleteClient(id) {
        if (!confirm("Удалить клиента?")) return;

        state.clients = (state.clients || []).filter(x => x.id !== id);
        if (state.project.clientId === id) {
          state.project.clientId = "";
          state.activeClientId = "";
        }

        toast("Клиент удалён");
        save();
        render();
      }

      function createTask(status) {
        state.tasks.unshift(normalizeTask({
          title: "Новая задача",
          status: status || "Новая",
          priority: "Средний",
          assignee: state.project.manager || "",
          deadline: state.project.deadline || "",
          note: ""
        }));
        state.view = "deal";
        state.dealView = "tasks";
        toast("Задача добавлена");
        save();
        render();
      }

      function updateTask(id, key, value) {
        const task = state.tasks.find(x => x.id === id);
        if (!task) return;
        task[key] = value;
        task.updatedAt = new Date().toISOString();
        save();
        render();
      }

      function deleteTask(id) {
        if (!confirm("Удалить задачу?")) return;
        state.tasks = state.tasks.filter(x => x.id !== id);
        save();
        render();
      }

      function createPayment() {
        state.payments.unshift(normalizePayment({ title: "Платёж", amount: 0, date: todayIso(), method: "", note: "" }));
        toast("Платёж добавлен");
        save();
        render();
      }

      function updatePayment(id, key, value) {
        const payment = state.payments.find(x => x.id === id);
        if (!payment) return;
        payment[key] = key === "amount" ? numberValue(value, 0) : value;
        save();
        render();
      }

      function deletePayment(id) {
        if (!confirm("Удалить платёж?")) return;
        state.payments = state.payments.filter(x => x.id !== id);
        save();
        render();
      }

      function createExpense() {
        state.expenses.unshift(normalizeExpense({ title: "Расход", amount: 0, date: todayIso(), category: "", note: "" }));
        toast("Расход добавлен");
        save();
        render();
      }

      function updateExpense(id, key, value) {
        const expense = state.expenses.find(x => x.id === id);
        if (!expense) return;
        expense[key] = key === "amount" ? numberValue(value, 0) : value;
        save();
        render();
      }

      function deleteExpense(id) {
        if (!confirm("Удалить расход?")) return;
        state.expenses = state.expenses.filter(x => x.id !== id);
        save();
        render();
      }

      function createTeamMember() {
        state.team.unshift(normalizeTeamMember({ name: "Новый участник", role: "", rate: 0, payout: 0, paid: false, note: "" }));
        toast("Участник добавлен");
        save();
        render();
      }

      function updateTeamMember(id, key, value) {
        const member = state.team.find(x => x.id === id);
        if (!member) return;

        if (["rate", "payout"].includes(key)) member[key] = numberValue(value, 0);
        else if (key === "paid") member[key] = Boolean(value);
        else member[key] = value;

        save();
        render();
      }

      function deleteTeamMember(id) {
        if (!confirm("Удалить участника?")) return;
        state.team = state.team.filter(x => x.id !== id);
        save();
        render();
      }

      function go(view) {
        state.view = view;
        save();
        render();
      }

      function setTab(tab) {
        state.tab = tab;
        save();
        render();
      }

      function setSearch(value) {
        state.search = value;
        save();
        render();
      }

      function setFilter(value) {
        state.filter = value;
        save();
        render();
      }

      function setSort(value) {
        state.sort = value;
        save();
        render();
      }

      function setProjectFilter(value) {
        state.projectFilter = value;
        save();
        render();
      }

      function setProjectSort(value) {
        state.projectSort = value;
        save();
        render();
      }

      function toggleClientMode() {
        state.clientMode = !state.clientMode;
        if (state.clientMode) state.view = "proposal";
        document.body.classList.toggle("client-mode", state.clientMode);
        save();
        render();
        toast(state.clientMode ? "Клиентский режим включён" : "Клиентский режим выключен");
      }

      function saveHistory() {
        if (isUndoing) return;
        undoStack.push(JSON.stringify(state));
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack = [];
      }

      function undo() {
        if (undoStack.length === 0) {
          toast("Нечего отменять");
          return;
        }
        isUndoing = true;
        redoStack.push(JSON.stringify(state));
        if (redoStack.length > MAX_UNDO) redoStack.shift();
        const prev = undoStack.pop();
        try {
          state = migrateState(JSON.parse(prev));
          normalizeState();
        } catch {
          state = defaultState();
        }
        save();
        render();
        isUndoing = false;
        toast("Действие отменено");
      }

      function redo() {
        if (redoStack.length === 0) {
          toast("Нечего повторять");
          return;
        }
        isUndoing = true;
        undoStack.push(JSON.stringify(state));
        const next = redoStack.pop();
        try {
          state = migrateState(JSON.parse(next));
          normalizeState();
        } catch {
          state = defaultState();
        }
        save();
        render();
        isUndoing = false;
        toast("Действие повторено");
      }

      function openClientEstimate(clientId) {
        const client = (state.clients || []).find(x => x.id === clientId);
        if (!client) return;
        state.project.client = client.name || "";
        state.project.clientId = client.id;
        state.activeClientId = client.id;
        state.view = "deal";
        state.dealView = "estimate";
        save();
        render();
      }

      function setDealView(view) {
        state.dealView = view;
        save();
        render();
      }

      function setCrmFilter(value) {
        state.crmFilter = value;
        save();
        render();
      }

      function toggleGlobalMenu() {
        const menu = document.getElementById("globalAddMenu");
        if (menu) menu.classList.toggle("open");
      }

      function closeGlobalMenu() {
        const menu = document.getElementById("globalAddMenu");
        if (menu) menu.classList.remove("open");
      }

      let autoSaveTimer = null;

      function scheduleAutoSave() {
        if (isUndoing) return;
        const ind = document.getElementById("autoSaveIndicator");
        if (ind) { ind.textContent = "Сохранение..."; ind.className = "autosave-indicator saving show"; }
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
          if (!state.activeProjectId) return;
          const existing = state.savedProjects.find(p => p.id === state.activeProjectId);
          if (!existing) return;
          const snap = currentProjectSnapshot();
          const f = financeTotals();
          Object.assign(existing, {
            name: state.project.name || "Проект",
            client: state.project.client || "",
            clientId: state.project.clientId || "",
            status: state.project.status || "Черновик",
            crmStatus: state.project.crmStatus || "Лид",
            priority: state.project.priority || "Средний",
            deadline: state.project.deadline || "",
            total: snap.total || 0,
            paid: f.paid,
            debt: f.debt,
            expensesTotal: f.totalExpenses,
            profit: f.profit,
            updatedAt: new Date().toISOString(),
            snapshot: snap
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          const ind2 = document.getElementById("autoSaveIndicator");
          if (ind2) {
            ind2.textContent = "Сохранено";
            ind2.className = "autosave-indicator show";
            setTimeout(() => { ind2.classList.remove("show"); }, 2000);
          }
        }, 2000);
      }

      function getAllTransactions() {
        const txs = [];
        const seen = new Set();

        function addTxs(payments, expenses, projectId, projectName) {
          (payments || []).forEach(p => {
            if (seen.has(p.id)) return; seen.add(p.id);
            txs.push({ ...p, _type: "income", projectId, projectName });
          });
          (expenses || []).forEach(e => {
            if (seen.has(e.id)) return; seen.add(e.id);
            txs.push({ ...e, _type: "expense", projectId, projectName });
          });
        }

        addTxs(state.payments, state.expenses, state.activeProjectId, state.project.name || "Текущий");

        state.savedProjects.forEach(proj => {
          if (proj.id === state.activeProjectId) return;
          const snap = proj.snapshot || {};
          addTxs(snap.payments, snap.expenses, proj.id, proj.name);
        });

        return txs.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      }

      function getMonthlyAnalytics(transactions) {
        const byMonth = {};
        transactions.forEach(tx => {
          const m = (tx.date || "").slice(0, 7);
          if (!m) return;
          if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0, label: m };
          if (tx._type === "income") byMonth[m].income += numberValue(tx.amount, 0);
          else byMonth[m].expense += numberValue(tx.amount, 0);
        });
        return Object.values(byMonth)
          .sort((a, b) => a.label.localeCompare(b.label))
          .slice(-12);
      }

      const PAYMENT_ARTICLES = ["Предоплата", "Оплата", "Частичная оплата", "Доп. оплата", "Возврат"];

      function openFinanceModal(type = "payment") {
        state.financeModal = {
          type,
          amount: "",
          date: todayIso(),
          title: type === "payment" ? "Предоплата" : "",
          method: "",
          category: type === "payment" ? "Предоплата" : (EXPENSE_CATEGORIES[0] || "Прочее"),
          note: "",
          projectId: state.activeProjectId || ""
        };
        save();
        renderModal();
      }

      function closeFinanceModal() {
        state.financeModal = null;
        save();
        renderModal();
      }

      function setFinanceModalType(type) {
        if (!state.financeModal) return;
        state.financeModal.type = type;
        state.financeModal.title = type === "payment" ? "Предоплата" : "";
        state.financeModal.category = type === "payment" ? "Предоплата" : (EXPENSE_CATEGORIES[0] || "Прочее");
        save();
        renderModal();
      }

      function setFinanceModalField(key, value) {
        if (!state.financeModal) return;
        state.financeModal[key] = value;
        save();
      }

      function saveFinanceModal() {
        if (!state.financeModal) return;
        const m = state.financeModal;
        const amount = numberValue(m.amount, 0);
        if (amount <= 0) { toast("Введи сумму больше нуля"); return; }
        saveHistory();

        const newRecord = m.type === "payment"
          ? normalizePayment({ title: m.title || "Поступление", amount, date: m.date || todayIso(), method: m.method || m.category || "", note: m.note || "" })
          : normalizeExpense({ title: m.title || "Расход", amount, date: m.date || todayIso(), category: m.category || EXPENSE_CATEGORIES[0] || "Прочее", note: m.note || "" });

        const targetProjectId = m.projectId || state.activeProjectId;

        if (targetProjectId && targetProjectId === state.activeProjectId) {
          if (m.type === "payment") state.payments.unshift(newRecord);
          else state.expenses.unshift(newRecord);
        } else if (targetProjectId) {
          const proj = state.savedProjects.find(p => p.id === targetProjectId);
          if (proj) {
            if (!proj.snapshot) proj.snapshot = {};
            if (m.type === "payment") {
              if (!proj.snapshot.payments) proj.snapshot.payments = [];
              proj.snapshot.payments.unshift(newRecord);
              proj.paid = (proj.paid || 0) + amount;
            } else {
              if (!proj.snapshot.expenses) proj.snapshot.expenses = [];
              proj.snapshot.expenses.unshift(newRecord);
              proj.expensesTotal = (proj.expensesTotal || 0) + amount;
            }
            proj.updatedAt = new Date().toISOString();
          }
        } else {
          if (m.type === "payment") state.payments.unshift(newRecord);
          else state.expenses.unshift(newRecord);
        }

        toast((m.type === "payment" ? "Поступление " : "Расход ") + money(amount) + " записано");
        state.financeModal = null;
        save();
        render();
      }

      function renderModal() {
        const el = document.getElementById("modalContainer");
        if (!el) return;
        if (state.mainMenuOpen) { el.innerHTML = renderMainMenuModal(); }
        else if (state.helpModal) { el.innerHTML = renderHelpModal(); }
        else if (state.adminModal) { el.innerHTML = renderAdminModalHtml(); }
        else if (state.clientModal) { el.innerHTML = renderClientModalHtml(); }
        else if (state.dealModal) { el.innerHTML = renderDealModalHtml(); }
        else if (state.taskModal) { el.innerHTML = renderTaskModalHtml(); }
        else if (state.editTransactionModal) { el.innerHTML = renderEditTransactionModal(); }
        else if (state.financeModal) { el.innerHTML = renderFinanceModal(); }
        else { el.innerHTML = ""; }
      }

      function renderFinanceModal() {
        const m = state.financeModal;
        if (!m) return "";
        const isPayment = m.type === "payment";
        const amount = numberValue(m.amount, 0);
        const isValid = amount > 0;

        return `
          <div class="modal-overlay" onclick="event.target===this&&app.closeFinanceModal()">
            <div class="modal-box">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
                <h2 style="margin:0;font-size:20px">${isPayment ? "Поступление" : "Расход"}</h2>
                <button onclick="app.closeFinanceModal()" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</button>
              </div>

              <div class="modal-type-switch">
                <button class="modal-type-btn income ${isPayment ? "active" : ""}" onclick="app.setFinanceModalType('payment')">+ Поступление</button>
                <button class="modal-type-btn expense ${!isPayment ? "active" : ""}" onclick="app.setFinanceModalType('expense')">− Расход</button>
              </div>

              <div class="field" style="margin-bottom:14px">
                <label style="font-size:11px;color:var(--muted);font-weight:850;letter-spacing:.04em">СУММА, ₽ *</label>
                <input class="modal-amount-input ${m.amount && !isValid ? "invalid" : ""}"
                  type="number" min="0" placeholder="0"
                  value="${escapeHtml(m.amount)}"
                  oninput="app.setFinanceModalField('amount',this.value)"
                  id="finModalAmount">
                ${m.amount && !isValid ? `<span style="color:var(--red);font-size:11px;display:block;margin-top:3px">Должно быть больше нуля</span>` : ""}
              </div>

              <div class="field" style="margin-bottom:14px">
                <label>Проект</label>
                <select onchange="app.setFinanceModalField('projectId',this.value)">
                  <option value="">— Без проекта —</option>
                  ${state.activeProjectId ? `<option value="${state.activeProjectId}" ${m.projectId === state.activeProjectId ? "selected" : ""}>★ ${escapeHtml(state.project.name || "Текущий проект")}</option>` : ""}
                  ${(state.savedProjects || []).filter(p => p.id !== state.activeProjectId).map(p =>
                    `<option value="${p.id}" ${m.projectId === p.id ? "selected" : ""}>${escapeHtml(p.name)}${p.client ? " · " + escapeHtml(p.client) : ""}</option>`
                  ).join("")}
                </select>
              </div>

              <div class="grid two" style="margin-bottom:14px">
                <div class="field">
                  <label>Описание</label>
                  <input value="${escapeHtml(m.title)}" oninput="app.setFinanceModalField('title',this.value)"
                    placeholder="${isPayment ? "Предоплата, оплата..." : "Транспорт, аренда..."}">
                </div>
                <div class="field">
                  <label>Дата</label>
                  <input type="date" value="${escapeHtml(m.date)}" onchange="app.setFinanceModalField('date',this.value)">
                </div>
              </div>

              <div class="grid two" style="margin-bottom:14px">
                <div class="field">
                  <label>${isPayment ? "Статья" : "Категория"}</label>
                  <select onchange="app.setFinanceModalField('category',this.value)">
                    ${isPayment
                      ? PAYMENT_ARTICLES.map(c => `<option value="${c}" ${m.category === c ? "selected" : ""}>${c}</option>`).join("")
                      : EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${m.category === c ? "selected" : ""}>${c}</option>`).join("")
                    }
                  </select>
                </div>
                ${isPayment ? `
                  <div class="field">
                    <label>Способ оплаты</label>
                    <input value="${escapeHtml(m.method)}" oninput="app.setFinanceModalField('method',this.value)"
                      placeholder="Наличные, карта, перевод...">
                  </div>
                ` : ""}
              </div>

              <div class="field" style="margin-bottom:22px">
                <label>Комментарий</label>
                <textarea style="min-height:72px" oninput="app.setFinanceModalField('note',this.value)"
                  placeholder="Необязательно">${escapeHtml(m.note)}</textarea>
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                <button class="btn" onclick="app.closeFinanceModal()">Отмена</button>
                <button class="modal-save-btn ${isPayment ? "income" : "expense"}"
                  onclick="app.saveFinanceModal()" ${!isValid && m.amount ? "disabled" : ""}>
                  Добавить
                </button>
              </div>
            </div>
          </div>
        `;
      }

      function setGFinFilter(value) {
        state.gFinFilter = value;
        save();
        render();
      }

      function setGFinTypeFilter(value) {
        state.gFinTypeFilter = value;
        save();
        render();
      }

      function setGFinSubTab(value) {
        state.gFinSubTab = value;
        save();
        render();
      }

      function setGFinDatePreset(preset) {
        state.gFinDatePreset = preset;
        save();
        render();
      }

      function setGFinDateFrom(v) {
        state.gFinDateFrom = v;
        state.gFinDatePreset = "custom";
        save();
        render();
      }

      function setGFinDateTo(v) {
        state.gFinDateTo = v;
        state.gFinDatePreset = "custom";
        save();
        render();
      }

      function filterByDateRange(txs) {
        const preset = state.gFinDatePreset || "all";
        if (preset === "all") return txs;
        const today = new Date();
        const fmt = d => d.toISOString().slice(0, 10);
        let from = "", to = fmt(today);
        if (preset === "month") {
          from = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
        } else if (preset === "3months") {
          const d = new Date(today); d.setMonth(d.getMonth() - 3); from = fmt(d);
        } else if (preset === "quarter") {
          const q = Math.floor(today.getMonth() / 3);
          from = fmt(new Date(today.getFullYear(), q * 3, 1));
        } else if (preset === "year") {
          from = fmt(new Date(today.getFullYear(), 0, 1));
        } else if (preset === "custom") {
          from = state.gFinDateFrom || ""; to = state.gFinDateTo || fmt(today);
        }
        return txs.filter(tx => {
          const d = tx.date || "";
          return (!from || d >= from) && (!to || d <= to);
        });
      }

      function duplicateDeal() {
        if (!state.activeProjectId) { toast("Нет активной сделки"); return; }
        duplicateSavedProject(state.activeProjectId);
      }

      function openClientDetail(clientId) {
        state.clientDetailId = clientId;
        state.view = "clients";
        save();
        render();
      }

      function closeClientDetail() {
        state.clientDetailId = "";
        save();
        render();
      }

      function updateClientField(clientId, key, value) {
        if (key === "phone" && value && !validatePhone(value)) {
          toast("❌ Неверный формат телефона. Пример: +7 900 000-00-00");
          return;
        }
        const client = (state.clients || []).find(c => c.id === clientId);
        if (!client) return;
        client[key] = value;
        client.updatedAt = new Date().toISOString();
        save();
        render();
      }

      function startWizardForClient(clientId) {
        const client = (state.clients || []).find(c => c.id === clientId);
        if (!client) return;
        state.wizard = {
          step: 2,
          clientMode: "existing",
          clientId,
          name: client.name,
          company: client.company || "",
          phone: client.phone || "",
          projectName: client.name + " — проект",
          projectType: "Видео",
          deadline: "",
        };
        state.view = "wizard";
        state.clientDetailId = "";
        save();
        render();
      }

      function startWizard() {
        const d30 = new Date(); d30.setDate(d30.getDate() + 30);
        state.wizard = {
          step: 1,
          clientMode: "new",
          clientId: "",
          name: "",
          company: "",
          phone: "",
          projectName: "",
          projectType: "Видео",
          deadline: d30.toISOString().slice(0, 10),
          pkgFilter: "all",
        };
        state.view = "wizard";
        save();
        render();
      }

      function wizardSetData(key, value) {
        if (!state.wizard) return;
        state.wizard[key] = value;
        save();
        render();
      }

      function wizardSetField(key, value) {
        if (!state.wizard) return;
        state.wizard[key] = value;
        // No render() — prevents cursor jump on text inputs
      }

      function wizardNext() {
        if (!state.wizard) return;
        const w = state.wizard;

        if (w.step === 1) {
          if (w.clientMode === "new") {
            const name = String(w.name || "").trim();
            if (!name) { toast("Введи имя клиента"); return; }
            if (w.phone && !validatePhone(w.phone)) { toast("❌ Неверный формат телефона. Пример: +7 900 000-00-00"); return; }
            const client = normalizeClient({ name, company: w.company, phone: w.phone, city: "" });
            client.id = uid("client");
            client.createdAt = new Date().toISOString();
            state.clients.unshift(client);
            w.clientId = client.id;
            if (!w.projectName) w.projectName = name + " — проект";
          } else {
            if (!w.clientId) { toast("Выбери клиента"); return; }
            const client = state.clients.find(x => x.id === w.clientId);
            if (client && !w.projectName) w.projectName = (client.name || "") + " — проект";
          }
          w.step = 2;
        } else if (w.step === 2) {
          if (!String(w.projectName || "").trim()) { toast("Введи название проекта"); return; }
          w.step = 3;
        }

        save();
        render();
      }

      function wizardBack() {
        if (!state.wizard) return;
        if (state.wizard.step > 1) state.wizard.step--;
        else { state.wizard = null; state.view = "home"; }
        save();
        render();
      }

      function cancelWizard() {
        state.wizard = null;
        state.view = "home";
        save();
        render();
      }

      function finishWizard(startView) {
        if (!state.wizard) return;
        const w = state.wizard;

        const client = state.clients.find(x => x.id === w.clientId);

        const fresh = defaultState();
        const keep = {
          company: deepClone(state.company),
          clients: deepClone(state.clients),
          savedProjects: deepClone(state.savedProjects),
          catalogPrices: deepClone(state.catalogPrices),
          priceHistory: deepClone(state.priceHistory),
          customItems: deepClone(state.customItems),
          hiddenItems: deepClone(state.hiddenItems),
          permanentlyDeleted: deepClone(state.permanentlyDeleted || {}),
          favorites: deepClone(state.favorites),
          packages: deepClone(state.packages),
          stages: deepClone(state.stages)
        };

        state = {
          ...fresh, ...keep,
          project: {
            ...fresh.project,
            name: String(w.projectName || "Новый проект").trim(),
            client: client ? client.name : "",
            clientId: w.clientId || "",
            city: client ? (client.city || "") : "",
            deadline: w.deadline || "",
            type: w.projectType || "Видео",
            crmStatus: "Лид"
          },
          activeClientId: w.clientId || "",
          wizard: null,
          view: "deal",
          dealView: startView || "estimate"
        };

        const snap = currentProjectSnapshot();
        const now = new Date().toISOString();
        const projId = uid("project");
        state.project.id = projId;
        state.project.createdAt = now;
        const autoSaved = normalizeSavedProject({
          id: projId,
          name: state.project.name || "Новый проект",
          client: state.project.client || "",
          clientId: state.project.clientId || "",
          status: state.project.status || "Черновик",
          crmStatus: state.project.crmStatus || "Лид",
          priority: state.project.priority || "Средний",
          deadline: state.project.deadline || "",
          city: state.project.city || "",
          total: snap.total || 0,
          paid: 0, debt: snap.total || 0,
          expensesTotal: 0, profit: snap.total || 0,
          createdAt: now, updatedAt: now,
          snapshot: snap
        });
        state.savedProjects.unshift(autoSaved);
        state.activeProjectId = projId;

        pushNotification("deal", "Новая сделка создана", state.project.name + (state.project.client ? " · " + state.project.client : ""), projId);
        toast("Сделка создана и сохранена");
        save();
        render();
      }

      function finishWizardWithPackage(pkgId) {
        finishWizard("estimate");
        applyPackage(pkgId);
      }

      function advanceCrmStatus(projectId) {
        const order = CRM_STATUSES;
        const project = state.savedProjects.find(x => x.id === projectId);
        if (!project) return;
        const idx = order.indexOf(project.crmStatus || "Лид");
        if (idx < order.length - 1) {
          project.crmStatus = order[idx + 1];
          if (project.snapshot?.project) project.snapshot.project.crmStatus = project.crmStatus;
          toast(`Статус → ${project.crmStatus}`);
          save();
          render();
        }
      }

      function openDeal(projectId) {
        loadSavedProject(projectId);
      }

      function dragStart(id) {
        draggedLineId = id;
      }

      function dragOver(event) {
        event.preventDefault();
      }

      function dropOn(targetId) {
        if (!draggedLineId || draggedLineId === targetId) return;

        saveHistory();
        const order = state.estimateOrder.filter(id => id !== draggedLineId);
        const targetIndex = order.indexOf(targetId);
        order.splice(targetIndex, 0, draggedLineId);

        state.estimateOrder = order;
        draggedLineId = "";

        save();
        render();
      }

      function downloadJson(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = filename;
        link.click();

        URL.revokeObjectURL(url);
      }

      function exportData() {
        downloadJson(`adervis-pro-backup-${dateStamp()}.json`, state);
        toast("Данные экспортированы");
      }

      function importDataFromFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
          try {
            const imported = JSON.parse(reader.result);
            if (!imported || typeof imported !== "object") throw new Error("Некорректный файл");
            state = migrateState(imported);
            save();
            render();
            toast("Данные импортированы");
          } catch (error) {
            alert("Не удалось импортировать файл: " + error.message);
          }
        };
        reader.readAsText(file);
      }

      function importData(event) {
        const file = event.target.files && event.target.files[0];
        importDataFromFile(file);
        event.target.value = "";
      }

      function exportCatalog() {
        downloadJson(`adervis-catalog-${dateStamp()}.json`, {
          catalogPrices: state.catalogPrices,
          customItems: state.customItems,
          hiddenItems: state.hiddenItems,
          favorites: state.favorites,
          priceHistory: state.priceHistory
        });
        toast("Каталог экспортирован");
      }

      function importCatalog(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
          try {
            const imported = JSON.parse(reader.result);
            state.catalogPrices = imported.catalogPrices || state.catalogPrices || {};
            state.customItems = imported.customItems || state.customItems || [];
            state.hiddenItems = imported.hiddenItems || state.hiddenItems || {};
            state.favorites = imported.favorites || state.favorites || {};
            state.priceHistory = imported.priceHistory || state.priceHistory || {};
            save();
            render();
            toast("Каталог импортирован");
          } catch (error) {
            alert("Не удалось импортировать каталог: " + error.message);
          }
        };
        reader.readAsText(file);
        event.target.value = "";
      }

      function safeFileName(value) {
        return String(value || "project")
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
          .slice(0, 80) || "project";
      }

      function exportXlsx() {
        if (!window.XLSX) {
          toast("Библиотека XLSX не загрузилась");
          return;
        }

        const ids = selectedIds();
        const t = totals();
        const proj = state.project;
        const comp = state.company;

        // ── Classify items into sections ──────────────────────────────
        function getSectionGroup(id) {
          const itemData = findItem(id, true);
          if (!itemData) return "other";
          const sec = itemData.section || "";
          const model = itemData.calcModel || "";
          if (model === "crewShift" || ["shoot", "photo", "event"].includes(sec)) return "crew";
          if (sec === "equipment") return "equip";
          if (["post", "sound", "animation"].includes(sec)) return "post";
          if (["creative", "pre", "management"].includes(sec)) return "pre";
          if (["marketing", "logistics"].includes(sec)) return "other";
          return "other";
        }

        const groups = { crew: [], equip: [], pre: [], post: [], other: [] };
        ids.forEach(id => { const g = getSectionGroup(id); groups[g].push(id); });

        // ── Build AOA (array of arrays) ───────────────────────────────
        const AOA = [];

        // Header block
        AOA.push([comp.name || "ADERVIS DIGITAL"]);
        AOA.push([]);
        AOA.push(["Клиент:", proj.client || ""]);
        AOA.push(["Название проекта:", proj.name || ""]);
        if (proj.deadline) AOA.push(["Дата сдачи:", proj.deadline]);
        AOA.push([]);

        function crewRow(id) {
          const itemData = findItem(id, true);
          const line = state.selected[id];
          if (!itemData) return null;
          const name = (line && line.lineName) || itemData.name;
          const days = numberValue((line && line.days) || state.project.days || 1, 1);
          const qty  = numberValue((line && line.qty) || 1, 1);
          const price = Math.round(numberValue((line && line.price) || 0, 0));
          const total = Math.round(lineTotal(id));
          return [name, days, qty, price, "", "", total];
        }

        function postRow(id) {
          const itemData = findItem(id, true);
          const line = state.selected[id];
          if (!itemData) return null;
          const name = (line && line.lineName) || itemData.name;
          const qty  = numberValue((line && line.qty) || 1, 1);
          const unit = itemData.unit || "ед.";
          const price = Math.round(numberValue((line && line.price) || 0, 0));
          const total = Math.round(lineTotal(id));
          return [name, qty, unit, price, "", "", total];
        }

        let hasHeader = false;
        function ensureColHeader(type) {
          if (type === "crew") {
            AOA.push(["Наименование", "Кол-во смен", "Кол. Чел/Ед", "Ставка", "Переработка", "Час. перераб.", "Итого"]);
          } else {
            AOA.push(["Наименование", "Кол-во", "Значение", "Ставка", "", "", "Итого"]);
          }
        }

        // Подготовка
        if (groups.pre.length) {
          ensureColHeader("post");
          AOA.push(["Подготовка"]);
          groups.pre.forEach(id => { const r = postRow(id); if (r) AOA.push(r); });
          AOA.push([]);
        }
        if (groups.crew.length) {
          ensureColHeader("crew");
          AOA.push(["Команда"]);
          groups.crew.forEach(id => { const r = crewRow(id); if (r) AOA.push(r); });
          AOA.push([]);
        }
        if (groups.equip.length) {
          ensureColHeader("crew");
          AOA.push(["Оборудование"]);
          groups.equip.forEach(id => { const r = crewRow(id); if (r) AOA.push(r); });
          AOA.push([]);
        }
        if (groups.post.length) {
          ensureColHeader("post");
          AOA.push(["Пост-продакшн"]);
          groups.post.forEach(id => { const r = postRow(id); if (r) AOA.push(r); });
          AOA.push([]);
        }
        if (groups.other.length) {
          ensureColHeader("post");
          AOA.push(["Прочее"]);
          groups.other.forEach(id => { const r = postRow(id); if (r) AOA.push(r); });
          AOA.push([]);
        }

        // Totals
        if (t.discount > 0) AOA.push(["", "", "", "", "", "Скидка:", -Math.round(t.discount)]);
        AOA.push(["", "", "", "", "", "Итог:", Math.round(t.base)]);
        if (t.tax > 0) {
          const taxLabel = `Налог ${proj.taxType || ""} ${Math.round(taxRateByType(proj.taxType) * 100)}%`;
          AOA.push(["", "", "", "", "", taxLabel.trim(), Math.round(t.tax)]);
        }
        AOA.push(["", "", "", "", "", "ОБЩИЙ ИТОГ:", Math.round(t.total)]);

        const ws = XLSX.utils.aoa_to_sheet(AOA);
        ws["!cols"] = [
          { wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 12 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Смета");

        // Tasks sheet
        const taskRows = (state.tasks || []).map((task, i) => ({
          "№": i + 1, "Задача": task.title, "Статус": task.status,
          "Приоритет": task.priority, "Ответственный": task.assignee,
          "Дедлайн": task.deadline, "Комментарий": task.note
        }));
        if (taskRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), "Задачи");

        // Finance sheet
        const finRows = [
          ...(state.payments || []).map(p => ({ "Тип": "Поступление", "Название": p.title, "Сумма": p.amount, "Дата": p.date, "Комментарий": p.note })),
          ...(state.expenses || []).map(e => ({ "Тип": "Расход", "Название": e.title, "Сумма": e.amount, "Дата": e.date, "Комментарий": e.note }))
        ];
        if (finRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finRows), "Финансы");

        XLSX.writeFile(wb, `${safeFileName(proj.name)}-смета.xlsx`);
        toast("Файл сохранён");
      }

      function copyProposalText() {
        const t = totals();
        const rows = selectedIds().map(id => {
          const itemData = findItem(id, true);
          if (!itemData) return "";
          const line = state.selected[id];
          const prefix = line?.optional ? "○" : "•";
          return `${prefix} ${itemData.name}: ${money(lineTotal(id))}`;
        }).filter(Boolean).join("\n");

        const text = [
          state.company.name || "Adervis",
          "",
          `Коммерческое предложение: ${state.project.name || "Проект"}`,
          `Клиент: ${state.project.client || "не указан"}`,
          `Город: ${state.project.city || ""}`,
          "",
          rows,
          "",
          `Итого: ${money(t.total)}`,
          t.optional ? `Итого с опциями: ${money(t.withOptional)}` : "",
          "",
          state.project.paymentTerms || "",
          state.project.deliveryTerms || ""
        ].filter(Boolean).join("\n");

        navigator.clipboard?.writeText(text);
        toast("Текст КП скопирован");
      }

      function printProposal() {
        const printArea = document.getElementById("printArea");
        if (printArea) printArea.innerHTML = renderProposalPrint();
        window.print();
      }

      async function downloadProposalPDF() {
        if (typeof html2pdf === "undefined") { toast("Загрузка библиотеки PDF..."); return; }
        const name = (state.project.name || "КП").replace(/[^\wа-яёА-ЯЁ\s-]/gi, "").trim();
        const date = new Date().toLocaleDateString("ru-RU").replace(/\./g, "-");
        const btn = document.querySelector("[onclick*='downloadProposalPDF']");
        if (btn) { btn.disabled = true; btn.textContent = "Генерация..."; }

        // Временно переключаем в светлую тему — иначе CSS-переменные дают белый текст на белом фоне
        const htmlEl = document.documentElement;
        const prevTheme = htmlEl.getAttribute("data-theme") || "dark";
        htmlEl.setAttribute("data-theme", "light");

        // Показываем #printArea (он скрыт в @media print, но не в обычном режиме)
        const printArea = document.getElementById("printArea");
        printArea.innerHTML = renderProposalPrint();
        printArea.style.cssText = "display:block;position:absolute;left:-9999px;top:0;width:794px;background:#fff;";

        try {
          await html2pdf().set({
            margin: [12, 14, 12, 14],
            filename: `КП_${name}_${date}.pdf`,
            image: { type: "jpeg", quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          }).from(printArea).save();
        } finally {
          printArea.style.cssText = "";
          printArea.innerHTML = "";
          htmlEl.setAttribute("data-theme", prevTheme);
          if (btn) { btn.disabled = false; btn.textContent = "⬇ PDF"; }
        }
      }

      function field(label, html) {
        return `
          <div class="field">
            <label>${escapeHtml(label)}</label>
            ${html}
          </div>
        `;
      }

      function projectFields() {
        return `
          <div class="grid four">
            ${field("Название проекта", `<input data-autosave data-scope="project" data-key="name" value="${escapeHtml(state.project.name)}">`)}
            ${field("Клиент", `<input data-autosave data-scope="project" data-key="client" value="${escapeHtml(state.project.client)}" placeholder="Название клиента">`)}
            ${field("Город", `<input data-autosave data-scope="project" data-key="city" value="${escapeHtml(state.project.city)}">`)}
            ${field("Статус", `
              <select data-autosave data-scope="project" data-key="status">
                ${["Черновик", "Отправлено", "На согласовании", "Согласовано", "В работе", "Завершено"].map(x => optionValueHtml(x, x, state.project.status)).join("")}
              </select>
            `)}
          </div>

          <div class="grid five" style="margin-top:14px">
            ${field("CRM-статус", `
              <select data-autosave data-scope="project" data-key="crmStatus">
                ${CRM_STATUSES.map(x => optionValueHtml(x, x, state.project.crmStatus)).join("")}
              </select>
            `)}
            ${field("Приоритет", `
              <select data-autosave data-scope="project" data-key="priority">
                ${PRIORITIES.map(x => optionValueHtml(x, x, state.project.priority)).join("")}
              </select>
            `)}
            ${field("Дней съёмки / проекта", `<input type="number" min="1" data-autosave data-scope="project" data-key="days" value="${escapeHtml(state.project.days)}">`)}
            ${field("Дедлайн", `<input type="date" data-autosave data-scope="project" data-key="deadline" value="${escapeHtml(state.project.deadline)}">`)}
            ${field("Менеджер", `<input data-autosave data-scope="project" data-key="manager" value="${escapeHtml(state.project.manager)}">`)}
          </div>

          <div class="grid two" style="margin-top:14px">
            ${field("Скидка, %", `<input type="number" min="0" max="100" data-autosave data-scope="project" data-key="discount" value="${escapeHtml(state.project.discount)}">`)}
            ${field("Источник", `<input data-autosave data-scope="project" data-key="source" value="${escapeHtml(state.project.source)}">`)}
          </div>
        `;
      }

      function render() {
        normalizeState();

        document.body.classList.toggle("client-mode", state.clientMode);

        const clientModeBtn = document.getElementById("clientModeBtn");
        if (clientModeBtn) {
          clientModeBtn.textContent = state.clientMode ? "🙈 Выйти" : "👁 Клиент";
          clientModeBtn.classList.toggle("primary", state.clientMode);
          clientModeBtn.classList.toggle("blue", !state.clientMode);
        }

        const root = document.getElementById("appContent");
        if (!root) return;

        const views = {
          home: renderHome,
          deal: renderDeal,
          wizard: renderWizard,
          "global-finances": renderGlobalFinances,
          "global-calendar": renderGlobalCalendar,
          packages: renderPackages,
          contracts: renderContracts,
          catalog: renderCatalog,
          estimate: renderEstimate,
          clients: renderClients,
          projects: renderProjects,
          tasks: renderTasks,
          finance: renderFinance,
          team: renderTeam,
          calendar: renderCalendar,
          crm: renderCrm,
          proposal: renderProposal,
          versions: renderVersions,
          settings: renderSettings,
          profile: renderProfile,
          plans: renderPlans,
          knowledge: renderKnowledge,
          support: renderSupport,
          briefs: renderBriefs
        };

        document.querySelectorAll(".nav button").forEach(button => {
          const v = button.dataset.view;
          const isActive = v === state.view
            || (v === "home" && state.view === "home")
            || (v === "deal" && state.view === "deal")
            || (v === "wizard" && state.view === "wizard");
          button.classList.toggle("active", isActive);
        });

        // Update mobile bottom nav active states
        const mbnViewMap = { mbnHome: ["home","wizard","profile","plans","settings","clients","knowledge","catalog","packages","contracts","support"], mbnDeal: ["deal","estimate","proposal","tasks","finance","team","calendar","versions","crm"], mbnFinances: ["global-finances","global-calendar"] };
        Object.entries(mbnViewMap).forEach(([id, views]) => {
          const el = document.getElementById(id);
          if (el) el.classList.toggle("active", views.includes(state.view));
        });

        const navEstimateBtn = document.getElementById("navEstimateBtn");
        const estimateTooltip = document.getElementById("estimateNavTooltip");
        if (navEstimateBtn) {
          const hasProject = selectedIds().length > 0 || state.activeProjectId;
          const projectName = hasProject && state.project.name ? state.project.name : "";
          navEstimateBtn.classList.toggle("has-project", !!projectName);
          if (estimateTooltip) estimateTooltip.dataset.project = projectName;
        }

        if (_portalId) {
          root.innerHTML = renderClientPortal();
          return;
        }

        if (_briefAgencyId) {
          root.innerHTML = renderBriefPage();
          return;
        }

        if (_dataLoading) {
          root.innerHTML = renderLoadingSkeleton();
          return;
        }

        if (localStorage.getItem('adervis_local_mode') !== '1' && !isSubscriptionActive() && _adminSession) {
          root.innerHTML = renderSubscriptionGate();
          return;
        }
        try {
          root.innerHTML = (views[state.view] || renderHome)();
        } catch(err) {
          console.error("Render error:", err);
          root.innerHTML = `
            <div style="min-height:60vh;display:flex;align-items:center;justify-content:center;padding:32px">
              <div style="text-align:center;max-width:460px">
                <div style="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--primary),var(--blue));display:grid;place-items:center;margin:0 auto 20px">
                  <img src="logo-icon.svg" alt="A" onerror="this.style.display='none'" style="width:42px;height:42px;object-fit:contain">
                </div>
                <h2 style="margin:0 0 10px;font-size:22px">Что-то пошло не так</h2>
                <p style="font-size:14px;color:var(--muted);line-height:1.6;margin:0 0 24px">Произошла ошибка при загрузке страницы.<br>Попробуйте обновить страницу или вернуться на главную.</p>
                <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                  <button class="btn primary" onclick="app.go('home')">На главную</button>
                  <button class="btn" onclick="location.reload()">Обновить страницу</button>
                </div>
                <div style="margin-top:20px;padding:12px;background:var(--panel2);border-radius:10px;font-size:11px;color:var(--muted);font-family:monospace;text-align:left;word-break:break-all">${escapeHtml(String(err))}</div>
                <div style="margin-top:16px;font-size:12px;color:var(--muted)">
                  Если ошибка повторяется — напишите нам: <a href="mailto:adervis.digital@gmail.com" style="color:var(--primary2)">adervis.digital@gmail.com</a>
                </div>
              </div>
            </div>
          `;
        }
        bindDynamicInputs();
        renderModal();
        renderAdminTopbar();
        renderAuthGateEl();
        renderNotifBadge();
        // Pay banner for expiring subscriptions
        const bannerContainer = document.getElementById("payBannerContainer");
        if (bannerContainer) bannerContainer.innerHTML = renderPayBanner();

        // Update profile avatar button
        const paBtn = document.getElementById("profileAvatarBtn");
        const paInner = document.getElementById("profileAvatarInner");
        if (paBtn && paInner) {
          paBtn.classList.toggle("active", state.view === "profile");
          const us = getUserSettings();
          if (us.avatarDataUrl) {
            paInner.innerHTML = `<img src="${us.avatarDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
          } else {
            const email = _adminSession ? _adminSession.user.email : "";
            const initial = email ? email[0].toUpperCase() : (state.company && state.company.name ? state.company.name[0].toUpperCase() : "A");
            paInner.textContent = initial;
          }
        }
        // Re-render open dropdowns
        if (_profileDdOpen) renderProfileDd();
        if (_helpDdOpen) renderHelpDd();
      }

      function bindDynamicInputs() {
        document.querySelectorAll("[data-autosave]").forEach(input => {
          input.addEventListener("change", event => {
            const el = event.currentTarget;
            const scope = el.dataset.scope;
            const key = el.dataset.key;
            const id = el.dataset.id;
            const value = el.type === "checkbox" ? el.checked : el.value;

            if (scope === "project") updateProject(key, value);
            if (scope === "company") updateCompany(key, value);
            if (scope === "line") updateLine(id, key, value);
            if (scope === "custom") updateCustomItem(id, key, value);
            if (scope === "clientDraft") updateClientDraft(key, value);
            if (scope === "task") updateTask(id, key, value);
            if (scope === "payment") updatePayment(id, key, value);
            if (scope === "expense") updateExpense(id, key, value);
            if (scope === "team") updateTeamMember(id, key, value);
          });
        });

        document.querySelectorAll("[data-live]").forEach(input => {
          input.addEventListener("input", event => {
            const el = event.currentTarget;
            const scope = el.dataset.scope;
            const key = el.dataset.key;
            const id = el.dataset.id;
            const value = el.type === "checkbox" ? el.checked : el.value;

            if (scope === "project") updateProject(key, value);
            if (scope === "company") updateCompany(key, value);
            if (scope === "line") updateLine(id, key, value);
            if (scope === "custom") updateCustomItem(id, key, value);
            if (scope === "clientDraft") updateClientDraft(key, value);
            if (scope === "task") updateTask(id, key, value);
            if (scope === "payment") updatePayment(id, key, value);
            if (scope === "expense") updateExpense(id, key, value);
            if (scope === "team") updateTeamMember(id, key, value);
          });
        });
      }

      function renderLoadingSkeleton() {
        const skel = (w, h, r) => `<span class="skel" style="width:${w};height:${h}px;border-radius:${r || 8}px;margin-bottom:0"></span>`;
        const cards4 = [0,1,2,3].map(() => `
          <div class="calc-box" style="display:flex;flex-direction:column;gap:10px">
            ${skel("55px", 12)} ${skel("80px", 24, 6)} ${skel("100px", 11)}
          </div>`).join("");
        const funnel = [0,1,2,3,4,5].map(() => `
          <span class="skel" style="min-width:72px;height:52px;border-radius:12px;flex-shrink:0"></span>`).join("");
        const dealCards = [0,1,2,3,4,5].map(() => `
          <div class="skel-card" style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                ${skel("70%", 15)} ${skel("45%", 11)}
              </div>
              ${skel("64px", 22, 99)}
            </div>
            ${skel("100%", 5, 99)}
            <div style="display:flex;justify-content:space-between">
              ${skel("60px", 11)} ${skel("50px", 11)}
            </div>
          </div>`).join("");
        return `
          <div>
            <div class="panel" style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px">
                <div style="display:flex;flex-direction:column;gap:8px">
                  ${skel("100px", 20, 6)} ${skel("220px", 12)}
                </div>
                <div style="display:flex;gap:8px">
                  ${skel("120px", 36, 10)} ${skel("88px", 36, 10)}
                </div>
              </div>
              <div class="grid four" style="margin-top:4px">${cards4}</div>
              <div style="display:flex;gap:8px;margin-top:16px;overflow-x:auto;padding-bottom:4px">${funnel}</div>
            </div>
            <div class="grid three">${dealCards}</div>
          </div>`;
      }

      /* ═══════════════════════════════════════════════════════
         ОНЛАЙН-БРИФ — публичная форма и CRM-раздел
      ═══════════════════════════════════════════════════════ */

      function renderBriefPage() {
        const f = _briefForm;
        if (f.sent) {
          return `
            <div class="brief-wrap">
              <div class="brief-inner">
                <div class="brief-card">
                  <div class="brief-success-wrap">
                    <div class="brief-success-icon">✅</div>
                    <h2>Заявка отправлена!</h2>
                    <p>Мы получили вашу заявку и свяжемся с вами в течение 24 часов.</p>
                  </div>
                </div>
              </div>
            </div>`;
        }
        const PROJECT_TYPES = ['Свадьба','Корпоратив','Рекламный ролик','Музыкальный клип','Мероприятие','Репортаж','Презентация / Обзор','Социальные сети / Reels','Документальный фильм','Другое'];
        const BUDGETS = ['Обсудим','До 30 000 ₽','30 000 – 80 000 ₽','80 000 – 200 000 ₽','200 000 – 500 000 ₽','500 000 ₽+'];
        const SOURCES = ['Рекомендация','Instagram / ВКонтакте','Google / Яндекс','TikTok / YouTube','Сарафанное радио','Другое'];
        const FORMATS = ['Горизонтальный (16:9)','Вертикальный (9:16, Reels/Shorts)','Квадратный (1:1)','Несколько форматов','Пока не знаю'];
        const DURATIONS = ['До 30 секунд','30–60 секунд','1–3 минуты','3–10 минут','Более 10 минут','Обсудим'];
        return `
          <div class="brief-wrap">
            <div class="brief-inner">
              <div class="brief-logo-row">
                <div class="brief-logo-box">
                  <img src="logo-icon.svg" alt="A" width="32" height="32" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
                  <span style="display:none;color:#fff;font-weight:900;font-size:20px">A</span>
                </div>
                <div>
                  <div style="font-size:18px;font-weight:900;line-height:1.2">ADERVIS CRM</div>
                  <div style="font-size:12px;color:var(--muted)">Видеопродакшн</div>
                </div>
              </div>
              <div class="brief-card">
                <h1>Заявка на видеосъёмку</h1>
                <p class="brief-sub">Расскажите о проекте — мы свяжемся с вами в течение 24 часов и обсудим детали. Чем подробнее опишете задачу, тем точнее будет расчёт.</p>

                <div class="brief-section-title">📋 Контактные данные</div>
                <div class="brief-fields">
                  <div class="brief-row">
                    <div class="field">
                      <label>Ваше имя *</label>
                      <input class="input" type="text" placeholder="Иван Иванов" value="${escapeHtml(f.name)}" oninput="app.updateBriefField('name',this.value)">
                    </div>
                    <div class="field">
                      <label>Телефон</label>
                      <input class="input" type="tel" placeholder="+7 900 000-00-00" value="${escapeHtml(f.phone)}" oninput="app.updateBriefField('phone',this.value)">
                    </div>
                  </div>
                  <div class="brief-row">
                    <div class="field">
                      <label>Email *</label>
                      <input class="input" type="email" placeholder="your@email.com" value="${escapeHtml(f.email)}" oninput="app.updateBriefField('email',this.value)">
                    </div>
                    <div class="field">
                      <label>Компания / Организация</label>
                      <input class="input" type="text" placeholder="ООО «Название»" value="${escapeHtml(f.company||'')}" oninput="app.updateBriefField('company',this.value)">
                    </div>
                  </div>
                  <div class="field">
                    <label>Город съёмки</label>
                    <input class="input" type="text" placeholder="Москва" value="${escapeHtml(f.city||'')}" oninput="app.updateBriefField('city',this.value)">
                  </div>
                </div>

                <div class="brief-section-title">🎬 О проекте</div>
                <div class="brief-fields">
                  <div class="brief-row">
                    <div class="field">
                      <label>Тип проекта</label>
                      <select class="input" onchange="app.updateBriefField('type',this.value)">
                        <option value="">Выберите...</option>
                        ${PROJECT_TYPES.map(t => `<option value="${t}" ${f.type===t?'selected':''}>${t}</option>`).join('')}
                      </select>
                    </div>
                    <div class="field">
                      <label>Формат видео</label>
                      <select class="input" onchange="app.updateBriefField('format',this.value)">
                        <option value="">Выберите...</option>
                        ${FORMATS.map(v => `<option value="${v}" ${(f.format||'')===v?'selected':''}>${v}</option>`).join('')}
                      </select>
                    </div>
                  </div>
                  <div class="brief-row">
                    <div class="field">
                      <label>Примерная длительность</label>
                      <select class="input" onchange="app.updateBriefField('duration',this.value)">
                        <option value="">Выберите...</option>
                        ${DURATIONS.map(d => `<option value="${d}" ${(f.duration||'')===d?'selected':''}>${d}</option>`).join('')}
                      </select>
                    </div>
                    <div class="field">
                      <label>Желаемая дата съёмки</label>
                      <input class="input" type="date" value="${f.deadline||''}" oninput="app.updateBriefField('deadline',this.value)">
                    </div>
                  </div>
                  <div class="field">
                    <label>Опишите проект подробно</label>
                    <textarea class="input" rows="5" placeholder="Расскажите об идее, целях видео, аудитории, месте съёмки, стиле. Чем больше деталей — тем точнее предложение." oninput="app.updateBriefField('desc',this.value)" style="resize:vertical">${escapeHtml(f.desc)}</textarea>
                  </div>
                </div>

                <div class="brief-section-title">💰 Бюджет и дополнительно</div>
                <div class="brief-fields">
                  <div class="brief-row">
                    <div class="field">
                      <label>Бюджет</label>
                      <select class="input" onchange="app.updateBriefField('budget',this.value)">
                        <option value="">Выберите...</option>
                        ${BUDGETS.map(b => `<option value="${b}" ${f.budget===b?'selected':''}>${b}</option>`).join('')}
                      </select>
                    </div>
                    <div class="field">
                      <label>Откуда узнали о нас?</label>
                      <select class="input" onchange="app.updateBriefField('source',this.value)">
                        <option value="">Выберите...</option>
                        ${SOURCES.map(s => `<option value="${s}" ${(f.source||'')===s?'selected':''}>${s}</option>`).join('')}
                      </select>
                    </div>
                  </div>
                  <div class="field">
                    <label>Ссылки на референсы / примеры работ, которые нравятся</label>
                    <textarea class="input" rows="2" placeholder="https://youtube.com/... или описание стиля..." oninput="app.updateBriefField('references',this.value)" style="resize:vertical">${escapeHtml(f.references||'')}</textarea>
                  </div>
                  <div class="field">
                    <label>Дополнительные пожелания</label>
                    <textarea class="input" rows="2" placeholder="Особые требования, пожелания к команде, вопросы..." oninput="app.updateBriefField('extra',this.value)" style="resize:vertical">${escapeHtml(f.extra||'')}</textarea>
                  </div>
                </div>

                <button class="brief-submit" onclick="app.submitBrief()" ${f.sending ? 'disabled' : ''}>
                  ${f.sending ? 'Отправляем...' : 'Отправить заявку →'}
                </button>
                ${f.error ? `<p class="brief-error">${escapeHtml(f.error)}</p>` : ''}
              </div>
              <p style="text-align:center;font-size:11px;color:var(--muted);margin-top:20px">
                Powered by <strong>ADERVIS CRM</strong> · Данные используются только для связи с вами
              </p>
            </div>
          </div>`;
      }

      function updateBriefField(key, value) {
        _briefForm[key] = value;
      }

      async function submitBrief() {
        const f = _briefForm;
        if (!f.name.trim()) { f.error = 'Укажите ваше имя'; render(); return; }
        if (!f.email.trim() || !f.email.includes('@')) { f.error = 'Укажите корректный email'; render(); return; }
        f.sending = true; f.error = ''; render();
        try {
          const sb = window.supabase.createClient(_DEFAULT_SB_URL, _DEFAULT_SB_KEY);
          const { error } = await sb.from('brief_submissions').insert({
            agency_id: _briefAgencyId,
            client_name: f.name.trim(),
            client_phone: (f.phone||'').trim(),
            client_email: f.email.trim(),
            project_type: f.type,
            description: [
              f.desc.trim(),
              f.format ? `Формат: ${f.format}` : '',
              f.duration ? `Длительность: ${f.duration}` : '',
              (f.company||'').trim() ? `Компания: ${f.company}` : '',
              (f.city||'').trim() ? `Город: ${f.city}` : '',
              (f.references||'').trim() ? `Референсы: ${f.references}` : '',
              (f.extra||'').trim() ? `Дополнительно: ${f.extra}` : '',
              (f.source||'').trim() ? `Источник: ${f.source}` : '',
            ].filter(Boolean).join('\n'),
            budget: f.budget,
            deadline: f.deadline || null,
            submitted_at: new Date().toISOString()
          });
          f.sending = false;
          if (error) { f.error = 'Ошибка отправки. Попробуйте позже.'; }
          else { f.sent = true; }
        } catch(e) {
          _briefForm.sending = false;
          _briefForm.error = 'Ошибка сети. Проверьте соединение и попробуйте снова.';
        }
        render();
      }

      /* ── CRM: просмотр входящих брифов ── */

      function getBriefLink() {
        const agencyId = getAgencyId();
        const base = location.origin + location.pathname.replace(/index\.html$/, '');
        return base + '?brief=' + agencyId;
      }

      function copyBriefLink() {
        const link = getBriefLink();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(link).then(() => toast('Ссылка скопирована!')).catch(() => {
            prompt('Скопируйте ссылку:', link);
          });
        } else {
          prompt('Скопируйте ссылку:', link);
        }
      }

      async function _loadBriefs() {
        if (!_supabase || !_adminSession || _briefsLoaded) return;
        const agencyId = getAgencyId();
        try {
          const { data } = await _supabase.from('brief_submissions')
            .select('*').eq('agency_id', agencyId)
            .order('submitted_at', { ascending: false });
          _briefs = data || [];
          _briefsLoaded = true;
          render();
        } catch(e) { console.warn('Briefs load:', e); _briefsLoaded = true; render(); }
      }

      async function convertBriefToDeal(briefId) {
        const brief = _briefs.find(b => b.id === briefId);
        if (!brief) return;
        let clientId = '';
        if (brief.client_name) {
          const existing = (state.clients || []).find(c =>
            (brief.client_email && c.email === brief.client_email) ||
            (brief.client_phone && c.phone === brief.client_phone)
          );
          if (existing) {
            clientId = existing.id;
          } else {
            const newClient = { id: uid('client'), name: brief.client_name, phone: brief.client_phone || '', email: brief.client_email || '', notes: '' };
            state.clients = [newClient, ...(state.clients || [])];
            clientId = newClient.id;
          }
        }
        const dealName = brief.project_type
          ? `${brief.project_type} · ${brief.client_name || 'Новый клиент'}`
          : (brief.client_name || 'Новый клиент');
        const newProject = {
          id: uid('proj'),
          name: dealName,
          client: brief.client_name || '',
          clientId,
          crmStatus: 'Бриф',
          notes: [brief.description, brief.budget ? 'Бюджет: ' + brief.budget : ''].filter(Boolean).join('\n'),
          deadline: brief.deadline || '',
          lines: [], payments: [], expenses: [], tasks: [], team: [],
          createdAt: new Date().toISOString()
        };
        state.savedProjects = [newProject, ...(state.savedProjects || [])];
        save();
        if (_supabase && _adminSession) {
          try {
            await _supabase.from('brief_submissions').update({ status: 'converted', deal_id: newProject.id }).eq('id', briefId);
          } catch(e) { /* ignore */ }
        }
        _briefs = _briefs.map(b => b.id === briefId ? { ...b, status: 'converted', deal_id: newProject.id } : b);
        toast('Сделка создана!');
        state.activeProjectId = newProject.id;
        state.view = 'deal';
        render();
      }

      async function deleteBrief(briefId) {
        if (!confirm('Удалить эту заявку?')) return;
        if (_supabase && _adminSession) {
          try { await _supabase.from('brief_submissions').delete().eq('id', briefId); } catch(e) { /* ignore */ }
        }
        _briefs = _briefs.filter(b => b.id !== briefId);
        render();
      }

      function renderBriefs() {
        if (!_briefsLoaded) {
          _loadBriefs();
          return `
            <div class="panel">
              <div style="text-align:center;padding:48px 24px;color:var(--muted)">
                <div style="font-size:32px;margin-bottom:12px">⏳</div>
                <p>Загружаем заявки...</p>
              </div>
            </div>`;
        }
        const link = getBriefLink();
        const newBriefs = _briefs.filter(b => b.status !== 'converted');
        const done = _briefs.filter(b => b.status === 'converted');
        return `
          <div>
            <div class="panel" style="margin-bottom:14px">
              <div class="section-title">
                <div>
                  <h1>Онлайн-брифы</h1>
                  <p>Заявки от клиентов по вашей персональной ссылке.</p>
                </div>
                <div class="toolbar no-print">
                  <button class="btn primary" onclick="app.copyBriefLink()">Копировать ссылку</button>
                </div>
              </div>
              <div class="brief-link-box" style="margin-top:14px">
                <span style="font-size:18px;flex-shrink:0">🔗</span>
                <span class="brief-link-url">${escapeHtml(link)}</span>
                <button class="btn small" onclick="app.copyBriefLink()" title="Копировать">Копировать</button>
              </div>
              <p style="font-size:12px;color:var(--muted);margin:10px 0 0">
                Поделитесь ссылкой с клиентом — он заполнит форму, и заявка появится здесь.
              </p>
            </div>

            ${newBriefs.length === 0 && done.length === 0 ? `
              <div class="panel" style="text-align:center;padding:48px 24px">
                <div style="font-size:48px;margin-bottom:16px">📋</div>
                <h3 style="margin:0 0 8px">Нет новых заявок</h3>
                <p style="color:var(--muted);font-size:14px">Скопируйте ссылку и поделитесь ею с клиентами</p>
              </div>
            ` : ''}

            ${newBriefs.length ? `
              <div style="margin-bottom:14px">
                <h2 style="font-size:14px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px">
                  Новые заявки (${newBriefs.length})
                </h2>
                <div style="display:flex;flex-direction:column;gap:10px">
                  ${newBriefs.map(b => renderBriefCard(b)).join('')}
                </div>
              </div>
            ` : ''}

            ${done.length ? `
              <div>
                <h2 style="font-size:14px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px">
                  Конвертировано в сделки (${done.length})
                </h2>
                <div style="display:flex;flex-direction:column;gap:10px">
                  ${done.map(b => renderBriefCard(b)).join('')}
                </div>
              </div>
            ` : ''}
          </div>`;
      }

      function renderBriefCard(b) {
        const isConverted = b.status === 'converted';
        const date = b.submitted_at ? new Date(b.submitted_at).toLocaleDateString('ru-RU', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
        return `
          <div class="brief-card-item" style="${isConverted ? 'opacity:.65' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
              <div style="min-width:0;flex:1">
                <div style="font-size:15px;font-weight:800">${escapeHtml(b.client_name || 'Без имени')}</div>
                <div style="font-size:12px;color:var(--muted);margin-top:3px;display:flex;flex-wrap:wrap;gap:8px">
                  ${b.client_email ? `<span>📧 ${escapeHtml(b.client_email)}</span>` : ''}
                  ${b.client_phone ? `<span>📞 ${escapeHtml(b.client_phone)}</span>` : ''}
                  ${date ? `<span>🕐 ${date}</span>` : ''}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
                ${isConverted
                  ? `<span class="status-pill" style="background:rgba(22,163,74,.12);color:#16a34a;font-size:11px">✓ Сделка</span>`
                  : `<button class="btn primary small" onclick="app.convertBriefToDeal('${b.id}')">Создать сделку</button>`}
                <button class="btn small" onclick="app.deleteBrief('${b.id}')" title="Удалить" style="padding:5px 8px;font-size:14px;color:var(--muted)">×</button>
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px">
              ${b.project_type ? `<span style="background:rgba(124,58,237,.1);color:var(--primary2);border-radius:6px;padding:2px 8px;font-weight:700">${escapeHtml(b.project_type)}</span>` : ''}
              ${b.budget ? `<span style="background:rgba(37,99,235,.1);color:var(--blue);border-radius:6px;padding:2px 8px;font-weight:700">${escapeHtml(b.budget)}</span>` : ''}
              ${b.deadline ? `<span style="background:rgba(202,138,4,.1);color:var(--yellow);border-radius:6px;padding:2px 8px;font-weight:700">📅 ${escapeHtml(b.deadline)}</span>` : ''}
            </div>
            ${b.description ? `<p style="margin:10px 0 0;font-size:13px;color:var(--muted);line-height:1.5">${escapeHtml(b.description)}</p>` : ''}
          </div>`;
      }

      function renderHome() {
        const projects = state.savedProjects || [];

        if (!projects.length && !(state.clients || []).length) {
          return renderWelcome();
        }

        const allStatuses = CRM_STATUSES;
        const filter = state.crmFilter || "all";

        const stageData = allStatuses.map(s => ({
          status: s,
          items: projects.filter(p => (p.crmStatus || "Лид") === s),
          total: projects.filter(p => (p.crmStatus || "Лид") === s).reduce((sum, p) => sum + (p.total || 0), 0)
        }));

        const visibleItems = filter === "all"
          ? projects
          : projects.filter(p => (p.crmStatus || "Лид") === filter);

        const totalPipeline = projects.filter(p => !["Сдано", "Закрыто"].includes(p.crmStatus || "Лид"))
          .reduce((s, p) => s + (p.total || 0), 0);
        const totalProfit = projects.reduce((s, p) => s + (p.profit || 0), 0);
        const inWork = projects.filter(p => p.crmStatus === "В работе").length;
        const closedCount = projects.filter(p => p.crmStatus === "Закрыто").length;

        const CRM_NEXT = {
          "Лид": "Взять в работу",
          "Бриф": "Отправить КП",
          "КП отправлено": "Клиент ответил",
          "Согласование": "Подписать договор",
          "Договор": "Получить предоплату",
          "Предоплата": "Начать работу",
          "В работе": "Сдать проект",
          "Сдано": "Закрыть сделку",
          "Закрыто": null
        };

        // ── Dashboard metrics ──────────────────────────────────────────
        const nowDate = new Date();
        const curMonth = `${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,"0")}`;
        const prevMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth()-1, 1);
        const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth()+1).padStart(2,"0")}`;

        function paymentsInMonth(m) {
          let sum = 0;
          state.savedProjects.forEach(p => { (p.snapshot?.payments||[]).forEach(x => { if (x.date?.startsWith(m)) sum += x.amount||0; }); });
          state.payments.forEach(x => { if (x.date?.startsWith(m)) sum += x.amount||0; });
          return sum;
        }

        const monthRevenue = paymentsInMonth(curMonth);
        const prevRevenue  = paymentsInMonth(prevMonth);
        const revDelta = prevRevenue > 0 ? Math.round((monthRevenue - prevRevenue) / prevRevenue * 100) : null;

        const totalDebt = projects.filter(p => !["Закрыто"].includes(p.crmStatus||"Лид"))
          .reduce((s, p) => s + Math.max(0, (p.total||0) - (p.paid||0)), 0);

        const avgDeal = closedCount > 0 ? Math.round(projects.filter(p=>p.crmStatus==="Закрыто").reduce((s,p)=>s+(p.total||0),0) / closedCount) : 0;

        const todayStr = todayIso();
        const in7 = new Date(); in7.setDate(in7.getDate()+7);
        const in7Str = in7.toISOString().slice(0,10);
        const upcomingDeadlines = [];
        projects.forEach(p => {
          if (p.deadline && p.deadline >= todayStr && p.deadline <= in7Str && !["Закрыто","Сдано"].includes(p.crmStatus||"Лид"))
            upcomingDeadlines.push({ name: p.name, date: p.deadline, type: "Проект" });
          (p.snapshot?.tasks||[]).forEach(t => {
            if (t.deadline && t.deadline >= todayStr && t.deadline <= in7Str && t.status !== "Готово")
              upcomingDeadlines.push({ name: t.title, date: t.deadline, type: "Задача" });
          });
          state.tasks.forEach(t => {
            if (t.deadline && t.deadline >= todayStr && t.deadline <= in7Str && t.status !== "Готово")
              upcomingDeadlines.push({ name: t.title, date: t.deadline, type: "Задача" });
          });
        });
        upcomingDeadlines.sort((a,b) => a.date.localeCompare(b.date));
        const uniqueDeadlines = upcomingDeadlines.filter((d,i,arr) => i === arr.findIndex(x => x.name===d.name && x.date===d.date));

        const monthNames2 = ["январе","феврале","марте","апреле","мае","июне","июле","августе","сентябре","октябре","ноябре","декабре"];
        const curMonthName = monthNames2[nowDate.getMonth()];

        return `
          <div>
            <!-- ── DASHBOARD HEADER ─────────────────────── -->
            <div class="db-header">
              <div class="db-header-left">
                <h1 class="db-greeting">Привет, ${escapeHtml((_adminSession?.user?.email||"").split("@")[0] || "команда")} 👋</h1>
                <p class="db-date">В ${curMonthName} · ${projects.length} сделок · ${inWork} в работе</p>
              </div>
              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.startWizard()">+ Новая сделка</button>
                <button class="btn" onclick="app.go('clients')">Клиенты</button>
              </div>
            </div>

            <!-- ── KPI CARDS ─────────────────────────────── -->
            <div class="db-kpi-grid">
              <div class="db-kpi" onclick="app.go('global-finances')" style="cursor:pointer">
                <div class="db-kpi-icon" style="background:rgba(22,163,74,.14);color:#4ade80">💰</div>
                <div class="db-kpi-body">
                  <div class="db-kpi-label">Выручка в месяце</div>
                  <div class="db-kpi-value">${money(monthRevenue)}</div>
                  ${revDelta !== null ? `<div class="db-kpi-delta ${revDelta>=0?"pos":"neg"}">${revDelta>=0?"↑":"↓"} ${Math.abs(revDelta)}% к прошлому</div>` : `<div class="db-kpi-delta neu">нет данных прошлого</div>`}
                </div>
              </div>
              <div class="db-kpi">
                <div class="db-kpi-icon" style="background:rgba(124,58,237,.14);color:var(--primary2)">📈</div>
                <div class="db-kpi-body">
                  <div class="db-kpi-label">Воронка (потенциал)</div>
                  <div class="db-kpi-value">${money(totalPipeline)}</div>
                  <div class="db-kpi-delta neu">${projects.filter(p=>!["Сдано","Закрыто"].includes(p.crmStatus||"Лид")).length} активных сделок</div>
                </div>
              </div>
              <div class="db-kpi ${totalDebt>0?"db-kpi-warn":""}" onclick="app.go('global-finances')" style="cursor:pointer">
                <div class="db-kpi-icon" style="background:rgba(234,88,12,.14);color:#fb923c">💳</div>
                <div class="db-kpi-body">
                  <div class="db-kpi-label">Долг от клиентов</div>
                  <div class="db-kpi-value" style="${totalDebt>0?"color:var(--orange)":""}">${money(totalDebt)}</div>
                  <div class="db-kpi-delta ${totalDebt>0?"neg":"pos"}">${totalDebt>0?"ожидаем оплату":"всё оплачено ✓"}</div>
                </div>
              </div>
              <div class="db-kpi">
                <div class="db-kpi-icon" style="background:rgba(8,145,178,.14);color:#22d3ee">🔧</div>
                <div class="db-kpi-body">
                  <div class="db-kpi-label">В работе сейчас</div>
                  <div class="db-kpi-value">${inWork}</div>
                  <div class="db-kpi-delta neu">${closedCount} закрыто за всё время</div>
                </div>
              </div>
              <div class="db-kpi">
                <div class="db-kpi-icon" style="background:rgba(246,189,58,.12);color:var(--yellow)">📊</div>
                <div class="db-kpi-body">
                  <div class="db-kpi-label">Средний чек</div>
                  <div class="db-kpi-value">${avgDeal > 0 ? money(avgDeal) : "—"}</div>
                  <div class="db-kpi-delta neu">по закрытым сделкам</div>
                </div>
              </div>
              <div class="db-kpi" onclick="app.go('global-calendar')" style="cursor:pointer">
                <div class="db-kpi-icon" style="background:rgba(220,38,38,.12);color:#f87171">📅</div>
                <div class="db-kpi-body">
                  <div class="db-kpi-label">Дедлайны (7 дней)</div>
                  <div class="db-kpi-value ${uniqueDeadlines.length>0?"":"" }">${uniqueDeadlines.length}</div>
                  <div class="db-kpi-delta ${uniqueDeadlines.length>2?"neg":uniqueDeadlines.length>0?"neu":"pos"}">${uniqueDeadlines.length>0 ? `ближайший: ${formatDate(uniqueDeadlines[0].date)}` : "дедлайнов нет ✓"}</div>
                </div>
              </div>
            </div>

            <div class="panel" style="margin-bottom:14px">
              <div class="crm-home-funnel">
                <div class="funnel-stage ${filter === "all" ? "active" : ""}" onclick="app.setCrmFilter('all')">
                  <h3>Все</h3>
                  <div class="fs-count">${projects.length}</div>
                </div>
                ${stageData.map(s => `
                  <div class="funnel-stage ${filter === s.status ? "active" : ""}" onclick="app.setCrmFilter('${s.status}')">
                    <h3>${escapeHtml(s.status)}</h3>
                    <div class="fs-count">${s.items.length}</div>
                    ${s.total ? `<div class="fs-amount">${money(s.total)}</div>` : ""}
                  </div>
                `).join("")}
              </div>
            </div>

            ${visibleItems.length ? `
              <div class="grid three">
                ${visibleItems.map(project => {
                  const margin = project.total > 0 ? Math.round((project.profit || 0) / project.total * 100) : 0;
                  const healthClass = margin >= 40 ? "green" : margin >= 20 ? "yellow" : margin > 0 ? "red" : "grey";
                  const nextLabel = CRM_NEXT[project.crmStatus || "Лид"];
                  const isCurrent = project.id === state.activeProjectId;
                  const payPct = project.total > 0 ? Math.min(100, Math.round((project.paid || 0) / project.total * 100)) : 0;

                  const clientObj = project.clientId ? state.clients.find(c => c.id === project.clientId) : null;
                  const clientIdSafe = (project.clientId||"").replace(/'/g,"\\x27");
                  const clientNameSafe = (project.client||"").replace(/'/g,"\\x27");
                  const projectIdSafe = project.id.replace(/'/g,"");
                  const u = project.deadline ? deadlineUrgency(project.deadline) : null;
                  return `
                    <div class="deal-card ${isCurrent ? "current" : ""}" onclick="app.openDealModal('${projectIdSafe}')" style="cursor:pointer" title="Редактировать сделку">
                      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                        <div style="min-width:0;flex:1">
                          <div class="deal-card-name">${escapeHtml(project.name)}</div>
                          ${project.client ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${escapeHtml(project.client)}${clientObj && clientObj.phone ? ` · ${escapeHtml(clientObj.phone)}` : ""}</div>` : ""}
                        </div>
                        <div style="display:flex;gap:4px;align-items:center;flex:0 0 auto">
                          <button class="deal-dup-btn" onclick="event.stopPropagation();app.duplicateDeal('${projectIdSafe}')" title="Дублировать сделку">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1H3a1 1 0 00-1 1v9h1V2h8V1zm2 2H5a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V4a1 1 0 00-1-1zm0 11H5V4h8v10z"/></svg>
                          </button>
                          <div class="health-dot ${healthClass}" title="Маржа ${margin}%"></div>
                          <span class="status-pill" style="font-size:11px">${escapeHtml(project.crmStatus || "Лид")}</span>
                        </div>
                      </div>

                      <div style="display:flex;gap:16px;margin-top:10px;align-items:flex-end">
                        <div>
                          <div style="font-size:10px;color:var(--muted);font-weight:850;letter-spacing:.04em">БЮДЖЕТ</div>
                          <div style="font-size:16px;font-weight:900;margin-top:2px">${money(project.total)}</div>
                        </div>
                        <div>
                          <div style="font-size:10px;color:var(--muted);font-weight:850;letter-spacing:.04em">ОПЛАЧЕНО</div>
                          <div style="font-size:16px;font-weight:900;margin-top:2px;color:${project.paid > 0 ? "var(--green)" : "var(--muted)"}">${money(project.paid || 0)}</div>
                        </div>
                        ${isCurrent ? `<span class="status-pill green" style="font-size:11px;margin-left:auto">текущий</span>` : ""}
                      </div>
                      <div class="deal-pay-bar" style="margin-top:8px;width:100%">
                        <div class="deal-pay-fill" style="width:${payPct}%"></div>
                      </div>
                      <div style="font-size:11px;margin-top:6px;font-weight:750;color:${project.deadline && u && u.level !== "ok" ? u.color : "var(--muted)"}">📅 ${project.deadline ? escapeHtml(formatDate(project.deadline)) + (u && u.level !== "ok" ? ` · ${escapeHtml(u.label)}` : "") : "Дедлайн не задан"}</div>

                      <div class="deal-card-footer" onclick="event.stopPropagation()">
                        <button class="btn small" onclick="app.openDeal('${projectIdSafe}')" title="Открыть смету, КП, задачи">Открыть</button>
                        ${nextLabel ? `<button class="next-action-btn" onclick="app.advanceCrmStatus('${projectIdSafe}')" title="Перевести в следующий статус">${nextLabel} →</button>` : `<span class="badge">Завершено</span>`}
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            ` : `
              <div class="empty">
                ${filter === "all" ? "Сделок пока нет." : `Нет сделок в статусе «${escapeHtml(filter)}».`}
                <br><button class="btn primary" style="margin-top:12px" onclick="app.startWizard()">+ Новая сделка</button>
              </div>
            `}
          </div>
        `;
      }


      function renderSummary() {
        const t = totals();
        const f = financeTotals();
        const margin = f.estimateTotal > 0 ? Math.round(f.profit / f.estimateTotal * 100) : 0;
        const marginClass = margin >= 40 ? "good" : margin >= 20 ? "ok" : "bad";
        const payPct = t.total > 0 ? Math.min(100, Math.round(f.paid / t.total * 100)) : 0;

        const stagesWithItems = state.stages
          .map(s => ({ stage: s, sum: stageTotal(s.id, false) }))
          .filter(x => x.sum > 0);

        return `
          <aside class="summary">
            <h2>Итоги сметы</h2>

            ${stagesWithItems.length > 1 ? stagesWithItems.map(x => `
              <div class="summary-stage-row">
                <span>${escapeHtml(x.stage.name)}</span>
                <strong>${money(x.sum)}</strong>
              </div>
            `).join("") : ""}

            ${t.discount ? `<div class="summary-line"><span>Скидка ${state.project.discount}%</span><strong>− ${money(t.discount)}</strong></div>` : ""}
            ${t.tax ? `<div class="summary-line"><span>Налог</span><strong>${money(t.tax)}</strong></div>` : ""}

            <div class="summary-total">
              <span>Итого для клиента</span>
              <strong>${money(t.total)}</strong>
            </div>

            ${t.optional ? `<div class="summary-line"><span>Опции (+)</span><strong>${money(t.optional)}</strong></div>` : ""}

            <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
              <div class="summary-line">
                <span>Оплачено ${payPct}%</span>
                <strong>${money(f.paid)}</strong>
              </div>
              <div class="deal-pay-bar" style="margin:4px 0 10px">
                <div class="deal-pay-fill" style="width:${payPct}%"></div>
              </div>
              ${f.debt > 0 ? `<div class="summary-line"><span>Долг</span><strong style="color:var(--orange)">${money(f.debt)}</strong></div>` : ""}
              <div class="summary-line"><span>Расходы</span><strong>${money(f.totalExpenses)}</strong></div>
              <div class="summary-line">
                <span>Прибыль</span>
                <strong>${money(f.profit)}</strong>
              </div>
              <div style="margin-top:8px">
                <span class="margin-badge ${marginClass}">${margin}% маржа</span>
              </div>
            </div>

            <div class="toolbar no-print" style="margin-top:16px">
              <button class="btn primary full" onclick="app.go('deal');app.setDealView('proposal')">Сформировать КП</button>
              ${!state.activeProjectId ? `<button class="btn full" onclick="app.saveCurrentProject()">Сохранить сделку</button>` : ""}
              <button class="btn full" onclick="app.createVersion()">Сохранить версию</button>
              <button class="btn danger full" onclick="app.clearEstimate()">Очистить смету</button>
            </div>
          </aside>
        `;
      }

      function renderPackages() {
        const CAT_META = {
          social:    { label: "Соц. сети", icon: "📱" },
          interview: { label: "Интервью",  icon: "🎙" },
          business:  { label: "Бизнес-видео", icon: "🎬" },
          events:    { label: "Мероприятия", icon: "🎪" },
          ai:        { label: "ИИ / AI",   icon: "🤖" },
          graphic:   { label: "Графика",   icon: "✨" },
          photo:     { label: "Фото",      icon: "📸" },
          corporate: { label: "Корпоративный", icon: "🏢" },
        };

        const catOrder = Object.keys(CAT_META);
        const allPkgs = state.packages || [];

        // Group packages by cat
        const groups = {};
        const ungrouped = [];
        allPkgs.forEach(pkg => {
          if (pkg.cat && CAT_META[pkg.cat]) {
            if (!groups[pkg.cat]) groups[pkg.cat] = [];
            groups[pkg.cat].push(pkg);
          } else {
            ungrouped.push(pkg);
          }
        });

        const TIER_COLORS = {
          1: { bg: "rgba(8,145,178,.12)", border: "rgba(8,145,178,.3)", text: "#22d3ee", label: "Старт" },
          2: { bg: "rgba(124,58,237,.12)", border: "rgba(124,58,237,.35)", text: "var(--primary2)", label: "Профи" },
          3: { bg: "rgba(246,189,58,.1)", border: "rgba(246,189,58,.4)", text: "var(--yellow)", label: "Премиум" },
        };

        function renderPkgCard(pkg) {
          const cat = pkg.cat || "";
          const tier = pkg.tier || 0;
          const tc = TIER_COLORS[tier] || {};
          const catMeta = CAT_META[cat] || {};
          const pkgItems = getPackageItems(pkg);
          const price = escapeHtml(pkg.priceLabel || money(packageApproxTotal(pkg)));
          const borderStyle = tier ? `border-color:${tc.border}` : "";
          return `
            <article class="package-card pkg-tier-${tier}" style="${borderStyle}">
              <div class="pkg-card-top">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  ${cat ? `<span class="pkg-cat-badge" data-cat="${escapeHtml(cat)}">${catMeta.icon || ""} ${escapeHtml(catMeta.label || cat)}</span>` : ""}
                  ${tier && tc.label ? `<span style="font-size:10px;font-weight:850;padding:2px 9px;border-radius:99px;background:${tc.bg};color:${tc.text};border:1px solid ${tc.border}">${tc.label}</span>` : ""}
                </div>
                ${pkg.id.startsWith("package_") ? `<button class="btn danger small" onclick="event.stopPropagation();app.deletePackage('${pkg.id}')" title="Удалить пакет" style="padding:4px 8px;font-size:11px">✕</button>` : ""}
              </div>

              <h3 class="pkg-card-name">${escapeHtml(pkg.name)}</h3>
              <p class="pkg-card-desc">${escapeHtml(pkg.desc)}</p>

              <div class="pkg-card-price">${price}</div>

              <div class="pkg-card-for">Для: ${escapeHtml(pkg.goodFor || "проектов")}</div>

              <div class="pkg-card-items">
                ${pkgItems.slice(0, 5).map(x => `<div class="pkg-item-line">✓ ${escapeHtml(x.name)}</div>`).join("")}
                ${pkgItems.length > 5 ? `<div class="pkg-item-line" style="color:var(--muted);opacity:.7">+ ещё ${pkgItems.length - 5} позиций</div>` : ""}
              </div>

              ${(pkg.notes || []).length ? `<p class="pkg-note">${escapeHtml(pkg.notes[0])}</p>` : ""}

              <div class="pkg-card-actions">
                <button class="btn primary" style="flex:1" onclick="app.applyPackage('${pkg.id}')">В смету →</button>
              </div>
            </article>
          `;
        }

        const allCatsWithData = catOrder.filter(cat => groups[cat]?.length);
        const [pkgCatFilter, setPkgCatFilter] = (() => {
          const v = state.pkgCatFilter || "all";
          return [v, (c) => { state.pkgCatFilter = c; render(); }];
        })();

        const filteredGroups = pkgCatFilter === "all"
          ? allCatsWithData
          : allCatsWithData.filter(c => c === pkgCatFilter);

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Пакеты услуг</h1>
                <p>Готовые наборы по категориям. Три уровня: Старт / Профи / Премиум.</p>
              </div>
              <div class="toolbar no-print">
                <button class="btn" onclick="app.createPackage()">+ Из сметы</button>
              </div>
            </div>

            <!-- Категориальные табы -->
            <div class="tabs" style="margin-bottom:20px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px">
              <button class="tab ${pkgCatFilter==="all"?"active":""}" onclick="app.setPkgCatFilter('all')">Все ${allPkgs.length ? `<span style="opacity:.6;font-size:11px">${allPkgs.length}</span>` : ""}</button>
              ${allCatsWithData.map(cat => `
                <button class="tab ${pkgCatFilter===cat?"active":""}" onclick="app.setPkgCatFilter('${cat}')" style="white-space:nowrap">${CAT_META[cat].icon} ${escapeHtml(CAT_META[cat].label)} <span style="opacity:.6;font-size:11px">${groups[cat].length}</span></button>
              `).join("")}
            </div>

            ${filteredGroups.map(cat => `
              <div class="pkg-group-header">${CAT_META[cat].icon} ${escapeHtml(CAT_META[cat].label)}</div>
              <div class="grid three" style="margin-bottom:24px">
                ${groups[cat].map(renderPkgCard).join("")}
              </div>
            `).join("")}

            ${ungrouped.length ? `
              <div class="pkg-group-header">Прочие пакеты</div>
              <div class="grid three">
                ${ungrouped.map(renderPkgCard).join("")}
              </div>
            ` : ""}
          </div>
        `;
      }

      function renderCatalog() {
        const tabs = [
          ["all", "Все"],
          ["favorites", "Избранное"],
          ["creative", "Креатив"],
          ["pre", "Подготовка"],
          ["shoot", "Съёмка"],
          ["photo", "Фото"],
          ["equipment", "Техника"],
          ["post", "Пост"],
          ["sound", "Звук"],
          ["animation", "Графика"],
          ["marketing", "Маркетинг"],
          ["management", "Менеджмент"],
          ["logistics", "Логистика"],
          ["ai", "ИИ / AI"],
          ["event", "Мероприятия"],
          ["custom", "Свои"],
          ["hidden", "Скрытые"]
        ];

        const hidden = hiddenItemsList();

        return `
          <div class="layout">
            <section class="panel">
              <div class="section-title">
                <div>
                  <h1>Каталог услуг</h1>
                  <p>Расширенный каталог с редактируемыми ценами, поиском, избранным и своими позициями.</p>
                </div>

                <div class="toolbar no-print">
                  <button class="btn" onclick="app.createCustomItem()">+ Своя позиция</button>
                  <button class="btn" onclick="app.exportCatalog()">Экспорт каталога</button>
                  <button class="btn" onclick="document.getElementById('importCatalogInput').click()">Импорт каталога</button>
                </div>
              </div>

              <div class="grid four">
                ${field("Поиск", `<input value="${escapeHtml(state.search)}" oninput="app.setSearch(this.value)" placeholder="монтаж, оператор, свет...">`)}
                ${field("Фильтр", `
                  <select onchange="app.setFilter(this.value)">
                    ${optionValueHtml("all", "Все", state.filter)}
                    ${optionValueHtml("selected", "В смете", state.filter)}
                    ${optionValueHtml("edited", "Изменённые цены", state.filter)}
                    ${optionValueHtml("hourly", "С почасовым расчётом", state.filter)}
                  </select>
                `)}
                ${field("Сортировка", `
                  <select onchange="app.setSort(this.value)">
                    ${optionValueHtml("name", "По названию", state.sort)}
                    ${optionValueHtml("priceAsc", "Цена ↑", state.sort)}
                    ${optionValueHtml("priceDesc", "Цена ↓", state.sort)}
                    ${optionValueHtml("category", "Категория", state.sort)}
                  </select>
                `)}
                ${field("Всего найдено", `<input readonly value="${filteredItems().length}">`)}
              </div>

              <div class="tabs">
                ${tabs.map(([id, label]) => `
                  <button class="tab ${state.tab === id ? "active" : ""}" onclick="app.setTab('${id}')">${escapeHtml(label)}</button>
                `).join("")}
              </div>

              ${state.tab === "hidden" && hidden.length ? `
                <div class="hidden-bar">Скрытые позиции не показываются в общем каталоге. Их можно восстановить.</div>
              ` : ""}

              <div class="list">
                ${filteredItems().length ? filteredItems().map(renderCatalogItem).join("") : `<div class="empty">Ничего не найдено</div>`}
              </div>
            </section>

            ${renderSummary()}
          </div>
        `;
      }

      function renderCatalogItem(itemData) {
        const selected = Boolean(state.selected[itemData.id]);
        const hidden = isHiddenItem(itemData.id);
        const custom = itemData.category === "custom";

        if (custom) return renderCustomCatalogItem(itemData, selected, hidden);

        return `
          <article class="item ${selected ? "selected" : ""} ${hidden ? "hidden-item" : ""}">
            <div class="item-top">
              <div>
                <h3>${highlightText(itemData.name)}</h3>
                <p>${highlightText(itemData.desc)}</p>

                <div class="badges">
                  <span class="badge">${escapeHtml(itemData.section)}</span>
                  <span class="badge">Этап: ${escapeHtml(getItemStageName(itemData))}</span>
                  <span class="badge">Модель: ${escapeHtml(itemData.calcModel)}</span>
                  <span class="badge">Ед.: ${escapeHtml(itemData.unit)}</span>
                  ${state.favorites[itemData.id] ? `<span class="status-pill">★ избранное</span>` : ""}
                </div>
              </div>

              <div class="price-editor no-print">
                <input class="catalog-price-input" type="number" value="${getCatalogPrice(itemData)}" onchange="app.updateCatalogPrice('${itemData.id}', this.value)" title="Цена">
              </div>
            </div>

            <div class="toolbar no-print" style="margin-top:14px">
              ${hidden ? `
                <button class="btn green" onclick="app.restoreCatalogItem('${itemData.id}')">Восстановить</button>
                <button class="btn danger" onclick="app.permanentlyDeleteItem('${itemData.id}')">Удалить навсегда</button>
              ` : `
                ${selected
                  ? `<button class="btn danger" onclick="app.removeItem('${itemData.id}')">Убрать из сметы</button>`
                  : `<button class="btn primary" onclick="app.addItem('${itemData.id}')">Добавить</button>`
                }
                <button class="btn" onclick="app.toggleFavorite('${itemData.id}')">${state.favorites[itemData.id] ? "★ Убрать" : "☆ В избранное"}</button>
                <button class="btn" onclick="app.duplicateToCustom('${itemData.id}')">Копия в свои</button>
                <button class="btn" onclick="app.resetCatalogPrice('${itemData.id}')">Сброс цены</button>
                <button class="btn danger" onclick="app.hideCatalogItem('${itemData.id}')">Скрыть</button>
              `}
            </div>
          </article>
        `;
      }

      function renderCustomCatalogItem(itemData, selected, hidden) {
        return `
          <article class="item ${selected ? "selected" : ""} ${hidden ? "hidden-item" : ""}">
            <div class="line-head">
              <div style="flex:1">
                <div class="grid two">
                  ${field("Название", `<input data-autosave data-scope="custom" data-id="${itemData.id}" data-key="name" value="${escapeHtml(itemData.name)}">`)}
                  ${field("Цена", `<input type="number" data-autosave data-scope="custom" data-id="${itemData.id}" data-key="price" value="${escapeHtml(itemData.price)}">`)}
                </div>

                <div class="grid two" style="margin-top:12px">
                  ${field("Категория", `
                    <select data-autosave data-scope="custom" data-id="${itemData.id}" data-key="category">
                      ${Object.keys(CAT).map(key => optionValueHtml(key, CAT[key], itemData.category)).join("")}
                    </select>
                  `)}
                  ${field("Этап", `
                    <select data-autosave data-scope="custom" data-id="${itemData.id}" data-key="stage">
                      ${state.stages.map(stage => optionValueHtml(stage.id, stage.name, itemData.stage)).join("")}
                    </select>
                  `)}
                </div>

                <div style="margin-top:12px">
                  ${field("Описание", `<textarea data-autosave data-scope="custom" data-id="${itemData.id}" data-key="desc">${escapeHtml(itemData.desc)}</textarea>`)}
                </div>
              </div>
            </div>

            <div class="toolbar no-print" style="margin-top:14px">
              ${selected
                ? `<button class="btn danger" onclick="app.removeItem('${itemData.id}')">Убрать из сметы</button>`
                : `<button class="btn primary" onclick="app.addItem('${itemData.id}')">Добавить</button>`
              }
              <button class="btn danger" onclick="app.deleteCustomItem('${itemData.id}')">Удалить</button>
            </div>
          </article>
        `;
      }

      function renderEstimate() {
        const inDeal = state.view === "deal";

        const stagesWithItems = state.stages
          .map(stage => ({ stage, ids: selectedIdsByStage(stage.id, true) }))
          .filter(x => x.ids.length);
        const allStagesCollapsed = stagesWithItems.length > 0 && stagesWithItems.every(x => state.stageCollapsed?.[x.stage.id]);

        const t = totals();
        const totalItems = selectedIds().length;

        return `
          <div class="layout">
            <section${inDeal ? "" : ' class="panel"'}>

              ${inDeal ? "" : `
                <div class="section-title">
                  <div>
                    <h1>Смета</h1>
                    <p>${escapeHtml(state.project.name || "Проект")}${state.project.client ? " · " + escapeHtml(state.project.client) : ""}</p>
                  </div>
                  <div class="toolbar no-print">
                    <button class="btn" onclick="app.go('catalog')">+ Добавить</button>
                    <button class="btn green" onclick="app.exportXlsx()">Excel</button>
                  </div>
                </div>
                ${projectFields()}
              `}

              <!-- Компактная шапка сметы -->
              <div style="display:flex;align-items:center;gap:10px;margin-top:${inDeal ? "0" : "18px"};margin-bottom:10px;flex-wrap:wrap;padding:10px 14px;background:var(--panel2);border-radius:14px;border:1px solid var(--line)">
                <div style="flex:1;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <div>
                    <div style="font-size:22px;font-weight:900;color:var(--text)">${money(t.total)}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:1px">${totalItems} позиц.${t.optional ? ` · опции +${money(t.optional)}` : ""}</div>
                  </div>
                  ${inDeal ? "" : `
                    <select data-autosave data-scope="project" data-key="taxType" style="width:auto;padding:5px 9px;font-size:12px;border-radius:10px;margin-left:4px">
                      ${taxOptionsHtml(state.project.taxType)}
                    </select>
                  `}
                </div>
                <div class="toolbar no-print" style="gap:5px;flex-direction:row;flex-wrap:wrap">
                  <button class="btn small" onclick="app.toggleAllEstimate()" title="${allStagesCollapsed ? "Развернуть всё" : "Свернуть всё"}">${allStagesCollapsed ? "⊞" : "⊟"}</button>
                  <button class="btn small" onclick="app.go('catalog')">+ Услуги</button>
                  <button class="btn small" onclick="app.go('packages')">+ Пакет</button>
                  ${inDeal ? "" : `<button class="btn small" onclick="app.createVersion()">Версия</button>`}
                </div>
              </div>

              <div style="margin-top:6px">
                ${stagesWithItems.length
                  ? stagesWithItems.map(renderEstimateStage).join("")
                  : `
                    <div class="empty" style="padding:40px 30px">
                      Смета пустая — добавь услуги из каталога или выбери пакет.<br>
                      <div class="toolbar no-print" style="margin-top:16px;justify-content:center">
                        <button class="btn primary" onclick="app.go('catalog')">Открыть каталог</button>
                        <button class="btn" onclick="app.go('packages')">Выбрать пакет</button>
                      </div>
                    </div>
                  `
                }
              </div>
            </section>

            ${renderSummary()}
          </div>
        `;
      }

      function renderEstimateStage(stageBlock) {
        const { stage, ids } = stageBlock;
        const isCollapsed = Boolean(state.stageCollapsed?.[stage.id]);
        const stageSum = ids.reduce((sum, id) => sum + lineTotal(id), 0);
        const mainCount = ids.filter(id => !state.selected[id]?.optional).length;
        const optionalCount = ids.filter(id => state.selected[id]?.optional).length;
        const color = stage.color || "#7c3aed";

        return `
          <section class="estimate-stage">
            <div class="stage-header">
              <div class="stage-header-left">
                <div class="stage-color-bar" style="background:${color}"></div>
                <div>
                  <h2 style="color:${color}">${escapeHtml(stage.name)}</h2>
                  <div class="stage-header-meta">
                    ${escapeHtml(stage.desc || "")}
                    · <strong>${mainCount}</strong> позиц.${optionalCount ? ` · <strong>${optionalCount}</strong> опц.` : ""}
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <div class="price" style="font-size:20px">${money(stageSum)}</div>
                <button class="btn small no-print" onclick="app.toggleStageCollapse('${stage.id}')">
                  ${isCollapsed ? "Развернуть" : "Свернуть"}
                </button>
              </div>
            </div>

            ${isCollapsed ? `
              <div class="stage-collapsed-note">
                Этап свернут — ${mainCount} позиц. на ${money(stageSum)}. Нажми «Развернуть».
              </div>
            ` : `
              <div class="stage-body">
                <div class="list">
                  ${ids.map(id => renderEstimateLine(id, color)).join("")}
                </div>
              </div>
            `}
          </section>
        `;
      }

      function renderEstimateLine(id, stageColor) {
        const itemData = findItem(id, true);
        const line = state.selected[id];
        if (!itemData || !line) return "";

        const stageId = line.stageId || itemData.stage;
        const total = lineTotal(id);
        const collapsed = Boolean(state.lineCollapsed?.[id]);

        const mainFields = [
          field("Этап", `
            <select data-autosave data-scope="line" data-id="${id}" data-key="stageId">
              ${state.stages.map(stage => optionValueHtml(stage.id, stage.name, stageId)).join("")}
            </select>
          `),
          field("Цена", `<input type="number" data-autosave data-scope="line" data-id="${id}" data-key="price" value="${escapeHtml(line.price)}">`)
        ];

        if (itemData.calcModel === "crewShift" || itemData.calcModel === "perDay") {
          mainFields.push(
            field("Дней", `<input type="number" min="1" data-autosave data-scope="line" data-id="${id}" data-key="days" value="${escapeHtml(line.days)}">`)
          );
        }

        if (itemData.calcModel === "fixed+qty") {
          mainFields.push(
            field("Кол-во", `<input type="number" min="0" step="1" data-autosave data-scope="line" data-id="${id}" data-key="qty" value="${escapeHtml(line.qty)}">`)
          );
        }

        const gridClass = mainFields.length >= 4 ? "four" : mainFields.length === 3 ? "three" : "two";

        return `
          <article class="item ${line.optional ? "optional" : ""}" draggable="true" ondragstart="app.dragStart('${id}')" ondragover="app.dragOver(event)" ondrop="app.dropOn('${id}')">
            <div class="item-top">
              <div style="display:flex;gap:12px">
                <div class="drag-handle no-print" title="Перетащи для сортировки">☰</div>
                <div style="flex:1">
                  <input class="line-name-input" type="text" data-autosave data-scope="line" data-id="${id}" data-key="lineName" value="${escapeHtml(line.lineName || "")}" placeholder="${escapeHtml(itemData.name)}" title="Нажми, чтобы переименовать позицию" style="color:var(--text);font-weight:750;font-size:15px">
                  <textarea class="line-desc-input" data-autosave data-scope="line" data-id="${id}" data-key="editedDesc" placeholder="${escapeHtml(itemData.desc)}" title="Нажми чтобы отредактировать описание" style="color:var(--muted);font-size:12px">${escapeHtml(line.editedDesc || "")}</textarea>

                  <div class="badges">
                    <span class="badge" style="background:${stageColor}22;color:${stageColor};border-color:${stageColor}44">${escapeHtml(itemData.section)}</span>
                    <span class="badge">Ед.: ${escapeHtml(itemData.unit)}</span>
                    ${line.optional ? `<span class="status-pill yellow">опция</span>` : `<span class="status-pill green">основная</span>`}
                  </div>
                </div>
              </div>

              <div class="price-editor">
                <div class="price">${money(total)}</div>
                <div class="line-total-note">${line.optional ? "Не входит в основной итог" : "Входит в основной итог"}</div>
                <div class="estimate-line-actions no-print">
                  <button class="btn small" onclick="app.toggleOptional('${id}')">${line.optional ? "В основные" : "В опции"}</button>
                  <button class="btn small" onclick="app.toggleLineCollapse('${id}')">${collapsed ? "Развернуть" : "Свернуть"}</button>
                </div>
              </div>
            </div>

            ${collapsed ? `
              <div class="line-collapsed-note">
                Позиция свернута. Итог: <strong>${money(total)}</strong>
              </div>
            ` : `
              <div class="grid ${gridClass}" style="margin-top:14px">
                ${mainFields.join("")}
              </div>

              ${renderLineAdvancedControls(id, itemData, line)}

              ${(() => {
                const bd = lineBreakdown(id);
                if (!bd.rows.length) return "";
                return `<div style="background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.15);border-radius:10px;padding:10px 14px;margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                  <div style="font-size:12px;color:var(--muted)">${bd.rows.map(r=>`<span>${escapeHtml(r.label)}: <strong>${money(r.value)}</strong></span>`).join(" · ")}</div>
                  <div style="font-weight:900;font-size:14px;white-space:nowrap">= ${money(bd.total)}</div>
                </div>`;
              })()}

              <details style="margin-top:10px" ${(line.clientComment || line.internalComment) ? "open" : ""}>
                <summary style="cursor:pointer;font-size:12px;color:var(--muted);font-weight:750;padding:4px 0">💬 Комментарий для клиента / внутренняя заметка</summary>
                <div class="grid two" style="margin-top:8px;gap:8px">
                  <div class="field" style="margin:0">
                    <label>Комментарий для клиента</label>
                    <textarea data-autosave data-scope="line" data-id="${id}" data-key="clientComment" style="min-height:52px;resize:vertical">${escapeHtml(line.clientComment || "")}</textarea>
                  </div>
                  <div class="field" style="margin:0">
                    <label>Внутренняя заметка</label>
                    <textarea data-autosave data-scope="line" data-id="${id}" data-key="internalComment" style="min-height:52px;resize:vertical">${escapeHtml(line.internalComment || "")}</textarea>
                  </div>
                </div>
              </details>
            `}

            <div class="toolbar no-print" style="margin-top:10px;gap:6px;flex-direction:row;flex-wrap:wrap">
              <button class="btn small" onclick="app.duplicateEstimateLine('${id}')">Дублировать</button>
              <button class="btn small danger" onclick="app.removeItem('${id}')">Удалить</button>
            </div>
          </article>
        `;
      }

      function renderLineBreakdown(id) {
        const breakdown = lineBreakdown(id);

        if (!breakdown.rows.length) return "";

        return `
          <div class="calc-box">
            <h3>Расшифровка расчёта</h3>

            <div class="list">
              ${breakdown.rows.map(row => `
                <div class="summary-line">
                  <span>
                    ${escapeHtml(row.label)}
                    ${row.note ? `<br><small class="mini-note">${escapeHtml(row.note)}</small>` : ""}
                  </span>
                  <strong>${money(row.value)}</strong>
                </div>
              `).join("")}
            </div>

            ${breakdown.warnings.length ? `
              <p class="mini-note">
                ${breakdown.warnings.map(escapeHtml).join("<br>")}
              </p>
            ` : ""}

            <div class="summary-total">
              <span>Итого по позиции</span>
              <strong>${money(breakdown.total)}</strong>
            </div>
          </div>
        `;
      }

      const AI_SERVICES = [
        { label: "Higgsfield (генерация движения)", price: 2990 },
        { label: "Syntex (видео + изображения)", price: 1990 },
        { label: "Runway Gen-3 (AI-видео)", price: 3500 },
        { label: "Midjourney (изображения)", price: 1200 },
        { label: "Sora (OpenAI видео)", price: 2500 },
        { label: "Pika (короткое видео)", price: 1500 },
        { label: "Kling AI (видеогенерация)", price: 1800 },
        { label: "Luma Dream Machine", price: 2000 },
        { label: "Adobe Firefly", price: 1500 },
        { label: "ElevenLabs (голос)", price: 1800 },
        { label: "Mubert (музыка AI)", price: 900 },
      ];

      function renderLineAdvancedControls(id, itemData, line) {
        if (itemData.id === "ai_sub_service") {
          const priceOptions = AI_SERVICES.map(s =>
            `<option value="${s.price}" ${line.price == s.price ? "selected" : ""}>${s.label} — ${money(s.price)}/мес</option>`
          ).join("");
          return `
            <div class="calc-box">
              <h3>AI-сервис</h3>
              <p class="mini-note">Выбери сервис — цена обновится автоматически. Или введи своё название сверху.</p>
              <div class="grid two">
                ${field("Выбрать сервис", `
                  <select onchange="(function(s){app.updateLine('${id}','lineName',s.options[s.selectedIndex].text.split(' —')[0]);app.updateLine('${id}','price',s.value)})(this)">
                    <option value="">— выбери —</option>
                    ${priceOptions}
                  </select>
                `)}
                ${field("Стоимость ₽/мес", `<input type="number" data-autosave data-scope="line" data-id="${id}" data-key="price" value="${escapeHtml(line.price)}">`)}
              </div>
            </div>
          `;
        }

        if (itemData.calcModel === "crewShift") {
          return `
            <div class="calc-box">
              <h3>Расчёт смены / часов</h3>
              <p class="mini-note">При оплате сменой итог считается от поля «Цена» в смете, умножается на дни и людей. Для почасовой оплаты — от часов и ставки.</p>

              <div class="grid four">
                ${field("Тип оплаты", `
                  <select data-autosave data-scope="line" data-id="${id}" data-key="crewBilling">
                    ${optionValueHtml("shift", "Сменой", line.crewBilling)}
                    ${optionValueHtml("hour", "Почасово", line.crewBilling)}
                  </select>
                `)}
                ${field("Смена", `
                  <select data-autosave data-scope="line" data-id="${id}" data-key="shiftType">
                    ${optionValueHtml("half", "Полсмены (4 ч)", line.shiftType)}
                    ${optionValueHtml("full", "Полная смена (8 ч)", line.shiftType)}
                    ${optionValueHtml("long", "Длинная смена (12 ч)", line.shiftType)}
                    ${optionValueHtml("premium", "Суперлонг (16+ ч)", line.shiftType)}
                  </select>
                `)}
                ${field("Людей", `<input type="number" min="1" data-autosave data-scope="line" data-id="${id}" data-key="people" value="${escapeHtml(line.people)}">`)}
                ${field("Сверхурочно, часов", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="overtimeHours" value="${escapeHtml(line.overtimeHours)}">`)}
              </div>

              <div class="grid two" style="margin-top:12px">
                ${field("Часов", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="hours" value="${escapeHtml(line.hours)}">`)}
                ${field("Ставка / час", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="hourlyRate" value="${escapeHtml(line.hourlyRate)}">`)}
              </div>
            </div>
          `;
        }

        if (itemData.calcModel === "equipmentRental") {
          return `
            <div class="calc-box">
              <h3>Аренда техники</h3>
              <div class="grid two">
                ${field("Дней аренды", `<input type="number" min="1" data-autosave data-scope="line" data-id="${id}" data-key="rentalDays" value="${escapeHtml(line.rentalDays)}">`)}
                ${field("Комплектов", `<input type="number" min="1" data-autosave data-scope="line" data-id="${id}" data-key="qty" value="${escapeHtml(line.qty)}">`)}
              </div>
            </div>
          `;
        }

        if (itemData.calcModel === "videoEdit") {
          return `
            <div class="calc-box">
              <h3>Монтаж</h3>
              <p class="mini-note">Стоимость считается от базы, длительности, камер, исходников, версий, правок, сложности и срочности.</p>

              <div class="grid four">
                ${field("Тип видео", `
                  <select data-autosave data-scope="line" data-id="${id}" data-key="videoType">
                    ${optionValueHtml("standard", "Стандартный ролик", line.videoType)}
                    ${optionValueHtml("reels", "Reels / Shorts", line.videoType)}
                    ${optionValueHtml("interview", "Интервью", line.videoType)}
                    ${optionValueHtml("event", "Мероприятие", line.videoType)}
                    ${optionValueHtml("ad", "Рекламный ролик", line.videoType)}
                    ${optionValueHtml("education", "Обучающее видео", line.videoType)}
                  </select>
                `)}
                ${field("Сложность", `
                  <select data-autosave data-scope="line" data-id="${id}" data-key="complexity">
                    ${optionValueHtml("simple", "Простая ×0.85", line.complexity)}
                    ${optionValueHtml("standard", "Стандарт ×1", line.complexity)}
                    ${optionValueHtml("advanced", "Сложная ×1.35", line.complexity)}
                    ${optionValueHtml("premium", "Премиум ×1.7", line.complexity)}
                    ${optionValueHtml("advertising", "Рекламная ×2", line.complexity)}
                  </select>
                `)}
                ${field("Длительность", `
                  <select data-autosave data-scope="line" data-id="${id}" data-key="durationPreset">
                    ${optionValueHtml("15", "15 сек", line.durationPreset)}
                    ${optionValueHtml("30", "30 сек", line.durationPreset)}
                    ${optionValueHtml("60", "1 мин", line.durationPreset)}
                    ${optionValueHtml("120", "2 мин", line.durationPreset)}
                    ${optionValueHtml("300", "5 мин", line.durationPreset)}
                    ${optionValueHtml("600", "10 мин", line.durationPreset)}
                    ${optionValueHtml("900", "15 мин", line.durationPreset)}
                    ${optionValueHtml("1200", "20 мин", line.durationPreset)}
                    ${optionValueHtml("custom", "Своя длина", line.durationPreset)}
                  </select>
                `)}
                ${field("Своя длительность, сек", `<input type="number" min="1" data-autosave data-scope="line" data-id="${id}" data-key="customDurationSec" value="${escapeHtml(line.customDurationSec)}">`)}
              </div>

              <div class="grid four" style="margin-top:12px">
                ${field("Размер блока, сек", `<input type="number" min="1" data-autosave data-scope="line" data-id="${id}" data-key="durationBlockSec" value="${escapeHtml(line.durationBlockSec || 60)}">`)}
                ${field("Блоков включено", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="includedDurationBlocks" value="${escapeHtml(line.includedDurationBlocks ?? 1)}">`)}
                ${field("Цена доп. блока", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="perMinutePrice" value="${escapeHtml(line.perMinutePrice || 0)}">`)}
                ${field("Оплачиваемых блоков", `<input readonly value="${durationPaidBlocks(line)}">`)}
              </div>

              <div class="grid four" style="margin-top:12px">
                ${field("Камер", `<input type="number" min="1" data-autosave data-scope="line" data-id="${id}" data-key="cameraCount" value="${escapeHtml(line.cameraCount || 1)}">`)}
                ${field("Камер включено", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="includedCameras" value="${escapeHtml(line.includedCameras ?? 1)}">`)}
                ${field("Цена доп. камеры", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="cameraExtraPrice" value="${escapeHtml(line.cameraExtraPrice || 0)}">`)}
                ${field("Исходников", `<input type="number" min="1" data-autosave data-scope="line" data-id="${id}" data-key="sourceCount" value="${escapeHtml(line.sourceCount || line.sourcePacks || 1)}">`)}
              </div>

              <div class="grid four" style="margin-top:12px">
                ${field("Исходников включено", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="includedSources" value="${escapeHtml(line.includedSources ?? 1)}">`)}
                ${field("Цена доп. исходника", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="sourceExtraPrice" value="${escapeHtml(line.sourceExtraPrice || 0)}">`)}
                ${field("Доп. версии", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="extraVersions" value="${escapeHtml(line.extraVersions)}">`)}
                ${field("Цена доп. версии", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="extraVersionPrice" value="${escapeHtml(line.extraVersionPrice || 0)}">`)}
              </div>

              <div class="grid four" style="margin-top:12px">
                ${field("Доп. круги правок", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="extraRevisions" value="${escapeHtml(line.extraRevisions)}">`)}
                ${field("Цена доп. правки", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="extraRevisionPrice" value="${escapeHtml(line.extraRevisionPrice || 0)}">`)}
                ${field("Срочность", `
                  <select data-autosave data-scope="line" data-id="${id}" data-key="urgentMode">
                    ${optionValueHtml("none", "Нет", line.urgentMode || "none")}
                    ${optionValueHtml("percent", "Процент", line.urgentMode)}
                    ${optionValueHtml("fixed", "Фикс. сумма", line.urgentMode)}
                  </select>
                `)}
                ${field("Срочность, %", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="urgentPercent" value="${escapeHtml(line.urgentPercent ?? 30)}">`)}
              </div>

              <div class="grid two" style="margin-top:12px">
                ${field("Срочность, фикс. сумма", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="urgentFixed" value="${escapeHtml(line.urgentFixed || 0)}">`)}
                ${field("Включено в базу", `<input readonly value="${escapeHtml(`${line.includedDurationBlocks ?? 1} блок, ${line.includedCameras ?? 1} камера, ${line.includedSources ?? 1} исходник`)}">`)}
              </div>
            </div>
          `;
        }

        if (itemData.calcModel === "creativeWork") {
          return `
            <div class="calc-box">
              <h3>Креативная работа</h3>
              <p class="mini-note">Для креатива дни не показываются: стоимость считается от цены, уровня сложности и дополнительных итераций.</p>

              <div class="grid two">
                ${field("Уровень", `
                  <select data-autosave data-scope="line" data-id="${id}" data-key="creativeLevel">
                    ${optionValueHtml("simple", "Простая", line.creativeLevel)}
                    ${optionValueHtml("standard", "Стандарт", line.creativeLevel)}
                    ${optionValueHtml("advanced", "Расширенная", line.creativeLevel)}
                    ${optionValueHtml("premium", "Премиум", line.creativeLevel)}
                  </select>
                `)}
                ${field("Доп. итерации", `<input type="number" min="0" data-autosave data-scope="line" data-id="${id}" data-key="iterations" value="${escapeHtml(line.iterations)}">`)}
              </div>
            </div>
          `;
        }

        if (itemData.calcModel === "perDay") {
          return `
            <div class="calc-box">
              <h3>Расчёт по дням</h3>
              <p class="mini-note">Стоимость считается как цена за день × количество дней.</p>
            </div>
          `;
        }

        return "";
      }

      function renderClients() {
        if (state.clientDetailId) return renderClientDetail(state.clientDetailId);

        const clients = state.clients || [];
        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Клиенты</h1>
                <p>Нажми на клиента, чтобы открыть его профиль и проекты.</p>
              </div>
            </div>

            ${state.clientDraft ? renderClientDraft() : ""}

            <div class="grid three">
              <div class="kb-new-card" onclick="app.openClientModal('')">
                <div class="kb-new-icon">+</div>
                <div class="kb-new-label">Новый клиент</div>
              </div>
              ${clients.length ? clients.map(client => `
                  <article class="client-card" style="cursor:pointer" onclick="app.openClientModal('${client.id}')">
                    <div class="line-head">
                      <div>
                        <h3>${escapeHtml(client.name)}</h3>
                        <p>${escapeHtml(client.company || client.city || "")}</p>
                      </div>
                      <span class="status-pill">${{new:"Новый",active:"Активный",vip:"VIP",paused:"Пауза",lost:"Потерян"}[client.status] || "Новый"}</span>
                    </div>
                    <div class="badges" style="margin-top:8px">
                      ${client.phone ? `<span class="badge">📞 ${escapeHtml(client.phone)}</span>` : ""}
                      ${client.email ? `<span class="badge">✉ ${escapeHtml(client.email)}</span>` : ""}
                    </div>
                    ${client.note ? `<p style="font-size:12px;margin-top:8px">${escapeHtml(client.note.slice(0,80))}${client.note.length > 80 ? "…" : ""}</p>` : ""}
                    <div class="toolbar no-print" style="margin-top:10px">
                      <button class="btn primary small" onclick="event.stopPropagation();app.openClientModal('${client.id}')">✏ Изменить</button>
                      <button class="btn small" onclick="event.stopPropagation();app.openClientDetail('${client.id}')">Проекты</button>
                      <button class="btn danger small" onclick="event.stopPropagation();app.deleteClient('${client.id}')">×</button>
                    </div>
                  </article>
                `).join("") : ""}
            </div>
          </div>
        `;
      }

      function renderClientDetail(clientId) {
        const client = (state.clients || []).find(c => c.id === clientId);
        if (!client) { state.clientDetailId = ""; return renderClients(); }

        const clientProjects = (state.savedProjects || []).filter(p => p.clientId === clientId || p.client === client.name);
        const totalRevenue = clientProjects.reduce((s, p) => s + (p.total || 0), 0);
        const totalPaid = clientProjects.reduce((s, p) => s + (p.paid || 0), 0);

        return `
          <div>
            <div class="client-detail-header">
              <div class="client-detail-top">
                <div>
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <button class="btn small" onclick="app.closeClientDetail()">← Все клиенты</button>
                    <h1 style="margin:0">${escapeHtml(client.name)}</h1>
                    <select style="border-radius:999px;padding:6px 10px;font-size:12px;font-weight:750;background:rgba(124,58,237,.16);border:1px solid rgba(124,58,237,.3);color:var(--text)" onchange="app.updateClientField('${client.id}','status',this.value)">
                      ${["new", "active", "vip", "paused", "lost"].map(s => `<option value="${s}" ${client.status === s ? "selected" : ""}>${{new:"Новый",active:"Активный",vip:"VIP",paused:"Пауза",lost:"Потерян"}[s]||s}</option>`).join("")}
                    </select>
                  </div>
                  ${client.company ? `<p style="margin:6px 0 0;font-size:14px;color:var(--muted)">${escapeHtml(client.company)}</p>` : ""}
                </div>
                <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
                  <div class="fin-card income-card" style="padding:12px 16px;min-width:110px">
                    <h3>Проектов</h3>
                    <div class="fin-amount">${clientProjects.length}</div>
                  </div>
                  <div class="fin-card income-card" style="padding:12px 16px;min-width:110px">
                    <h3>Оборот</h3>
                    <div class="fin-amount">${money(totalRevenue)}</div>
                  </div>
                  <div class="fin-card income-card" style="padding:12px 16px;min-width:110px">
                    <h3>Получено</h3>
                    <div class="fin-amount">${money(totalPaid)}</div>
                  </div>
                </div>
              </div>

              <div class="grid three">
                ${field("Имя / название", `<input value="${escapeHtml(client.name)}" onchange="app.updateClientField('${client.id}','name',this.value)">`)}
                ${field("Компания", `<input value="${escapeHtml(client.company||"")}" onchange="app.updateClientField('${client.id}','company',this.value)">`)}
                ${field("Город", `<input value="${escapeHtml(client.city||"")}" onchange="app.updateClientField('${client.id}','city',this.value)">`)}
                ${field("Телефон", `<input value="${escapeHtml(client.phone||"")}" onchange="app.updateClientField('${client.id}','phone',this.value)" onblur="app.checkPhoneField(this)" placeholder="+7 900 000-00-00"> `)}
                ${field("Email", `<input value="${escapeHtml(client.email||"")}" onchange="app.updateClientField('${client.id}','email',this.value)" placeholder="mail@example.com">`)}
                ${field("Источник", `<input value="${escapeHtml(client.source||"")}" onchange="app.updateClientField('${client.id}','source',this.value)" placeholder="Рекомендация, инстаграм...">`)}
              </div>
              <div style="margin-top:12px">
                ${field("Заметка о клиенте", `<textarea onchange="app.updateClientField('${client.id}','note',this.value)" placeholder="Предпочтения, условия, важные детали...">${escapeHtml(client.note||"")}</textarea>`)}
              </div>
              ${client.requisites ? `
                <div style="margin-top:12px">
                  ${field("Реквизиты", `<textarea onchange="app.updateClientField('${client.id}','requisites',this.value)">${escapeHtml(client.requisites||"")}</textarea>`)}
                </div>
              ` : `
                <div style="margin-top:10px">
                  <button class="btn small" onclick="this.parentElement.innerHTML='<textarea onchange=\\'app.updateClientField(\\'${client.id}\\',\\'requisites\\',this.value)\\'></textarea>';this.previousElementSibling?.remove()">+ Добавить реквизиты</button>
                </div>
              `}

              <div class="toolbar no-print" style="margin-top:14px">
                <button class="btn primary" onclick="app.startWizardForClient('${client.id}')">+ Новый проект для клиента</button>
                <button class="btn" onclick="app.openClientEstimate('${client.id}')">Открыть текущую смету</button>
                <button class="btn danger" onclick="app.deleteClient('${client.id}')">Удалить клиента</button>
              </div>
            </div>

            <h2 style="margin:0 0 12px">Проекты клиента</h2>

            ${clientProjects.length ? `
              <div class="client-projects-list">
                ${clientProjects.map(project => `
                  <div class="client-project-row" onclick="app.openDeal('${project.id}')">
                    <div>
                      <h4>${escapeHtml(project.name)}</h4>
                      <p>${escapeHtml(formatDate(project.updatedAt))} · ${escapeHtml(project.crmStatus || "")}</p>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px">
                      <div style="text-align:right">
                        <div style="font-weight:900">${money(project.total)}</div>
                        <div style="font-size:11px;color:var(--muted)">оплачено ${money(project.paid)}</div>
                      </div>
                      <span class="status-pill">${escapeHtml(project.crmStatus || project.status)}</span>
                    </div>
                  </div>
                `).join("")}
              </div>
            ` : `<div class="empty">Проектов с этим клиентом пока нет.</div>`}
          </div>
        `;
      }

      function renderClientDraft() {
        const client = state.clientDraft;

        return `
          <div class="panel" style="margin-bottom:18px;box-shadow:none;background:var(--panel2)">
            <h2>${client.id ? "Редактировать клиента" : "Новый клиент"}</h2>

            <div class="grid three">
              ${field("Имя / название", `<input data-live data-scope="clientDraft" data-key="name" value="${escapeHtml(client.name)}">`)}
              ${field("Компания", `<input data-live data-scope="clientDraft" data-key="company" value="${escapeHtml(client.company)}">`)}
              ${field("Город", `<input data-live data-scope="clientDraft" data-key="city" value="${escapeHtml(client.city)}">`)}
              ${field("Телефон", `<input data-live data-scope="clientDraft" data-key="phone" value="${escapeHtml(client.phone)}" onblur="app.checkPhoneField(this)">`)}
              ${field("Email", `<input data-live data-scope="clientDraft" data-key="email" value="${escapeHtml(client.email)}">`)}
              ${field("Источник", `<input data-live data-scope="clientDraft" data-key="source" value="${escapeHtml(client.source)}">`)}
            </div>

            <div style="margin-top:12px">
              ${field("Заметка", `<textarea data-live data-scope="clientDraft" data-key="note">${escapeHtml(client.note)}</textarea>`)}

            </div>

            <div class="toolbar no-print" style="margin-top:14px">
              <button class="btn primary" onclick="app.saveClientDraft()">Сохранить</button>
              <button class="btn" onclick="app.cancelClientDraft()">Отмена</button>
            </div>
          </div>
        `;
      }

      function filteredProjects() {
        let projects = [...(state.savedProjects || [])];

        if (state.projectFilter !== "all") {
          projects = projects.filter(project => project.crmStatus === state.projectFilter || project.status === state.projectFilter);
        }

        if (state.projectSort === "updatedDesc") projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        if (state.projectSort === "deadlineAsc") projects.sort((a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")));
        if (state.projectSort === "totalDesc") projects.sort((a, b) => numberValue(b.total, 0) - numberValue(a.total, 0));
        if (state.projectSort === "profitDesc") projects.sort((a, b) => numberValue(b.profit, 0) - numberValue(a.profit, 0));

        return projects;
      }

      function renderProjects() {
        const projects = filteredProjects();

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Сохранённые проекты</h1>
                <p>Сохраняй разные проекты с полным снимком сметы, задач, финансов, команды и настроек.</p>
              </div>

              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.saveCurrentProject()">Сохранить текущий</button>
                <button class="btn" onclick="app.newProject()">Новый проект</button>
              </div>
            </div>

            <div class="grid three" style="margin-bottom:16px">
              ${field("Фильтр", `
                <select onchange="app.setProjectFilter(this.value)">
                  ${optionValueHtml("all", "Все проекты", state.projectFilter)}
                  ${CRM_STATUSES.map(x => optionValueHtml(x, x, state.projectFilter)).join("")}
                  ${["Черновик", "Отправлено", "На согласовании", "Согласовано", "В работе", "Завершено"].map(x => optionValueHtml(x, x, state.projectFilter)).join("")}
                </select>
              `)}
              ${field("Сортировка", `
                <select onchange="app.setProjectSort(this.value)">
                  ${optionValueHtml("updatedDesc", "Сначала обновлённые", state.projectSort)}
                  ${optionValueHtml("deadlineAsc", "По дедлайну", state.projectSort)}
                  ${optionValueHtml("totalDesc", "По сумме", state.projectSort)}
                  ${optionValueHtml("profitDesc", "По прибыли", state.projectSort)}
                </select>
              `)}
              ${field("Найдено", `<input readonly value="${projects.length}">`)}
            </div>

            <div class="grid three">
              ${projects.length ? projects.map(project => `
                <article class="project-card">
                  <div class="line-head">
                    <div>
                      <h3>${escapeHtml(project.name)}</h3>
                      <p>${escapeHtml(project.client || "Клиент не указан")}</p>
                    </div>
                    <span class="status-pill">${escapeHtml(project.crmStatus || project.status)}</span>
                  </div>

                  <div class="badges">
                    <span class="badge">${escapeHtml(project.city || "")}</span>
                    <span class="badge">Обновлён: ${formatDate(project.updatedAt)}</span>
                    ${project.deadline ? `<span class="badge">Дедлайн: ${formatDate(project.deadline)}</span>` : ""}
                    <span class="badge">Приоритет: ${escapeHtml(project.priority || "")}</span>
                  </div>

                  <div class="metric-grid">
                    <div class="metric"><span>Итого</span><strong>${money(project.total)}</strong></div>
                    <div class="metric"><span>Оплачено</span><strong>${money(project.paid)}</strong></div>
                    <div class="metric"><span>Прибыль</span><strong>${money(project.profit)}</strong></div>
                  </div>

                  <div class="toolbar no-print" style="margin-top:14px">
                    <button class="btn primary" onclick="app.loadSavedProject('${project.id}')">Открыть</button>
                    <button class="btn" onclick="app.duplicateSavedProject('${project.id}')">Копия</button>
                    <button class="btn danger" onclick="app.deleteSavedProject('${project.id}')">Удалить</button>
                  </div>
                </article>
              `).join("") : `<div class="empty">Сохранённых проектов пока нет</div>`}
            </div>
          </div>
        `;
      }

      function renderTasks() {
        const cols = TASK_STATUSES;

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Задачи проекта</h1>
                <p>Мини-канбан для текущего проекта: подготовка, съёмка, монтаж, согласования и сдача.</p>
              </div>
              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.createTask()">+ Задача</button>
              </div>
            </div>

            <div class="kanban">
              ${cols.map(status => {
                const tasks = state.tasks.filter(task => task.status === status);

                return `
                  <div class="kanban-col"
                    ondragover="event.preventDefault();this.classList.add('dragover')"
                    ondragleave="this.classList.remove('dragover')"
                    ondrop="app.onKanbanDrop(event,'${status}','task');this.classList.remove('dragover')">
                    <h3>
                      <span>${escapeHtml(status)} <span class="pill-count">${tasks.length}</span></span>
                      <button class="btn small no-print" onclick="app.createTask('${status}')" title="Добавить задачу в «${escapeHtml(status)}»">+ Задача</button>
                    </h3>

                    <div class="list">
                      ${tasks.length ? tasks.map(renderTaskCard).join("") : `<div class="empty kanban-drop-hint">Пусто</div>`}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }

      function renderTaskCard(task) {
        const priorityColor = { "Низкий": "#64748b", "Средний": "#ca8a04", "Высокий": "#ea580c", "Срочно": "#dc2626" };
        const pColor = priorityColor[task.priority] || "#64748b";
        const isOverdue = task.deadline && task.deadline < todayIso() && task.status !== "Готово";

        return `
          <div class="swipe-wrap" data-task-id="${task.id}">
            <div class="swipe-delete-bg">🗑</div>
          <article class="task-card" style="border-left:3px solid ${pColor};padding:12px 14px"
            draggable="true"
            ondragstart="app.onKanbanDragStart(event,'${task.id}','task')"
            ondragend="document.querySelectorAll('.kanban-col').forEach(c=>c.classList.remove('dragover'))">
            <div style="display:flex;gap:8px;align-items:flex-start">
              <input class="task-title-input"
                data-autosave data-scope="task" data-id="${task.id}" data-key="title"
                value="${escapeHtml(task.title)}" placeholder="Задача...">
              <button onclick="app.deleteTask('${task.id}')"
                style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px;flex:0 0 auto;line-height:1" title="Удалить">×</button>
            </div>

            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
              <select class="task-mini-select" data-autosave data-scope="task" data-id="${task.id}" data-key="status">
                ${TASK_STATUSES.map(s => `<option value="${s}" ${task.status===s?"selected":""}>${s}</option>`).join("")}
              </select>
              <select class="task-mini-select" data-autosave data-scope="task" data-id="${task.id}" data-key="priority"
                style="border-color:${pColor};color:${pColor}">
                ${PRIORITIES.map(p => `<option value="${p}" ${task.priority===p?"selected":""}>${p}</option>`).join("")}
              </select>
              ${task.deadline ? `<span class="badge" style="${isOverdue?"color:var(--red);border-color:rgba(220,38,38,.4)":""}">${isOverdue?"!" : ""}${escapeHtml(formatDate(task.deadline))}</span>` : ""}
              ${task.assignee ? `<span style="font-size:11px;color:var(--muted)">${escapeHtml(task.assignee)}</span>` : ""}
            </div>

            <details style="margin-top:6px">
              <summary style="font-size:11px;color:var(--muted);cursor:pointer;padding:4px 0">
                ▸ Подробнее
              </summary>
              <div style="margin-top:10px;display:grid;gap:8px">
                <div class="grid two">
                  ${field("Ответственный", `<input data-autosave data-scope="task" data-id="${task.id}" data-key="assignee" value="${escapeHtml(task.assignee)}">`)}
                  ${field("Дедлайн", `<input type="date" data-autosave data-scope="task" data-id="${task.id}" data-key="deadline" value="${escapeHtml(task.deadline)}">`)}
                </div>
                ${field("Комментарий", `<textarea data-autosave data-scope="task" data-id="${task.id}" data-key="note" style="min-height:60px">${escapeHtml(task.note)}</textarea>`)}
              </div>
            </details>
          </article>
          </div>
        `;
      }

      function renderFinance() {
        const f = financeTotals();
        const t = totals();
        const margin = f.estimateTotal > 0 ? Math.round(f.profit / f.estimateTotal * 100) : 0;
        const marginClass = margin >= 40 ? "good" : margin >= 20 ? "ok" : "bad";
        const payPct = t.total > 0 ? Math.min(100, Math.round(f.paid / t.total * 100)) : 0;
        const half = Math.round(t.total / 2);

        const allTransactions = [
          ...(state.payments || []).map(p => ({ ...p, _type: "income" })),
          ...(state.expenses || []).map(e => ({ ...e, _type: "expense" }))
        ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

        const expByCategory = {};
        (state.expenses || []).forEach(e => {
          const cat = e.category || "Прочее";
          expByCategory[cat] = (expByCategory[cat] || 0) + numberValue(e.amount, 0);
        });

        const inDeal = state.view === "deal";

        return `
          <div class="layout">
            <section class="panel">

              ${inDeal ? "" : `
                <div class="section-title" style="margin-bottom:18px">
                  <div>
                    <h1>Финансы</h1>
                    <p>${escapeHtml(state.project.name || "Проект")} · ${escapeHtml(state.project.client || "Клиент не указан")}</p>
                  </div>
                  <button class="btn green" onclick="app.exportXlsx()">Excel</button>
                </div>
              `}

              <div class="fin-summary-grid">
                <div class="fin-card">
                  <h3>Бюджет (смета)</h3>
                  <div class="fin-amount">${money(f.estimateTotal)}</div>
                  <div class="fin-sub">50% = ${money(half)}</div>
                </div>
                <div class="fin-card income-card">
                  <h3>Оплачено</h3>
                  <div class="fin-amount">${money(f.paid)}</div>
                  <div class="fin-sub">${payPct}%</div>
                  <div class="deal-pay-bar" style="margin-top:8px;width:100%">
                    <div class="deal-pay-fill" style="width:${payPct}%"></div>
                  </div>
                </div>
                <div class="fin-card ${f.debt > 0 ? "expense-card" : "income-card"}">
                  <h3>Долг</h3>
                  <div class="fin-amount" style="color:${f.debt > 0 ? "var(--orange)" : "var(--green)"}">${money(f.debt)}</div>
                  <div class="fin-sub">${f.debt > 0 ? "Ожидаем" : "Закрыто"}</div>
                </div>
                <div class="fin-card expense-card">
                  <h3>Расход</h3>
                  <div class="fin-amount">${money(f.totalExpenses)}</div>
                  <div class="fin-sub">вкл. команда</div>
                </div>
                <div class="fin-card profit-card">
                  <h3>Прибыль</h3>
                  <div class="fin-amount">${money(f.profit)}</div>
                  <div class="fin-sub"><span class="margin-badge ${marginClass}">${margin}%</span></div>
                </div>
              </div>

              <div class="fin-quick-add no-print">
                <div class="fin-quick-half income">
                  <button class="fin-quick-btn income" onclick="app.openFinanceModal('payment')">+ Поступление</button>
                </div>
                <div class="fin-quick-half expense">
                  <button class="fin-quick-btn expense" onclick="app.openFinanceModal('expense')">− Расход</button>
                </div>
              </div>

              <div class="fin-action-bar no-print">
                <span style="font-size:12px;color:var(--muted)">${allTransactions.length} операц.</span>
                ${Object.keys(expByCategory).length > 1 ? `
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto">
                    ${Object.entries(expByCategory).sort((a,b) => b[1]-a[1]).slice(0,4).map(([cat, sum]) => `
                      <span class="fin-category-badge">${escapeHtml(cat)}: <strong>${money(sum)}</strong></span>
                    `).join("")}
                  </div>
                ` : ""}
              </div>

              ${(() => {
                /* Мини-график по месяцам для текущей сделки */
                const monthMap = {};
                allTransactions.forEach(tx => {
                  const d = (tx.date || "").slice(0, 7);
                  if (!d) return;
                  if (!monthMap[d]) monthMap[d] = { income: 0, expense: 0 };
                  if (tx._type === "income") monthMap[d].income += numberValue(tx.amount, 0);
                  else monthMap[d].expense += numberValue(tx.amount, 0);
                });
                const months = Object.keys(monthMap).sort();
                if (months.length < 2) return "";
                const maxVal = Math.max(...months.map(m => Math.max(monthMap[m].income, monthMap[m].expense)), 1);
                const BAR_H = 60;
                return `
                  <div style="margin:14px 0 10px;padding:14px 16px;background:var(--panel2);border-radius:14px;border:1px solid var(--line)">
                    <div style="font-size:12px;font-weight:750;color:var(--muted);margin-bottom:10px">График по месяцам</div>
                    <div style="display:flex;align-items:flex-end;gap:8px;overflow-x:auto;padding-bottom:4px">
                      ${months.map(m => {
                        const incH = Math.max(2, Math.round(monthMap[m].income / maxVal * BAR_H));
                        const expH = Math.max(2, Math.round(monthMap[m].expense / maxVal * BAR_H));
                        const label = m.slice(5) + "/" + m.slice(2, 4);
                        return `
                          <div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:36px" title="${m}: +${money(monthMap[m].income)} −${money(monthMap[m].expense)}">
                            <div style="display:flex;gap:2px;align-items:flex-end;height:${BAR_H}px">
                              <div style="width:10px;height:${incH}px;background:var(--green);border-radius:3px 3px 0 0;opacity:.85"></div>
                              <div style="width:10px;height:${expH}px;background:var(--red);border-radius:3px 3px 0 0;opacity:.7"></div>
                            </div>
                            <span style="font-size:9px;color:var(--muted);white-space:nowrap">${label}</span>
                          </div>
                        `;
                      }).join("")}
                    </div>
                    <div style="display:flex;gap:12px;font-size:10px;color:var(--muted);margin-top:6px">
                      <span><span style="display:inline-block;width:8px;height:8px;background:var(--green);border-radius:2px;margin-right:3px"></span>Поступления</span>
                      <span><span style="display:inline-block;width:8px;height:8px;background:var(--red);opacity:.7;border-radius:2px;margin-right:3px"></span>Расходы</span>
                    </div>
                  </div>
                `;
              })()}

              <div class="fin-table-wrap">
                <table class="fin-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Описание</th>
                      <th>Категория / метод</th>
                      <th>Тип</th>
                      <th style="text-align:right">Сумма</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${allTransactions.length ? allTransactions.map(tx => {
                      const txType = tx._type === "income" ? "income" : "expense";
                      const projId = escapeHtml(state.activeProjectId || "");
                      const openEdit = `app.openEditTransaction('${escapeHtml(tx.id)}','${txType}','${projId}')`;
                      return `
                      <tr style="cursor:pointer" onclick="${openEdit}" title="Нажмите чтобы редактировать">
                        <td style="color:var(--muted);font-size:12px;white-space:nowrap" onclick="${openEdit}">${escapeHtml(formatDate(tx.date))}</td>
                        <td onclick="event.stopPropagation()">
                          <input style="background:transparent;border:none;border-bottom:1px solid transparent;width:100%;font-size:13px;color:var(--text)"
                            value="${escapeHtml(tx.title)}"
                            data-autosave data-scope="${txType}" data-id="${tx.id}" data-key="title"
                            onmouseenter="this.style.borderBottomColor='var(--line)'"
                            onmouseleave="this.style.borderBottomColor='transparent'"
                            onclick="event.stopPropagation()">
                        </td>
                        <td style="font-size:12px;color:var(--muted)" onclick="event.stopPropagation()">
                          ${tx._type === "income"
                            ? `<input style="background:transparent;border:none;font-size:12px;color:var(--muted);width:100%"
                                value="${escapeHtml(tx.method || "")}" placeholder="Наличные, перевод..."
                                data-autosave data-scope="payment" data-id="${tx.id}" data-key="method"
                                onclick="event.stopPropagation()">`
                            : tx.category ? `<span class="fin-category-badge">${escapeHtml(tx.category)}</span>` : `<span style="color:var(--muted)">—</span>`
                          }
                        </td>
                        <td onclick="${openEdit}">
                          <span class="type-badge ${txType}">
                            ${tx._type === "income" ? "Поступление" : "Расход"}
                          </span>
                        </td>
                        <td class="amount-cell ${txType}" onclick="${openEdit}">
                          ${tx._type === "income" ? "+" : "−"}${money(tx.amount)}
                        </td>
                        <td style="width:32px" onclick="event.stopPropagation()">
                          <button class="btn danger small no-print" style="padding:4px 8px"
                            onclick="event.stopPropagation();${tx._type === "income" ? `app.deletePayment('${tx.id}')` : `app.deleteExpense('${tx.id}')`}">×</button>
                        </td>
                      </tr>`;
                    }).join("") : `
                      <tr>
                        <td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">
                          Операций пока нет. Нажми «+ Поступление» или «− Расход».
                          <br><small>Предоплата 50%: <strong>${money(half)}</strong></small>
                        </td>
                      </tr>
                    `}
                  </tbody>
                  ${allTransactions.length ? `
                    <tfoot class="fin-table-footer">
                      <tr>
                        <td colspan="3"></td>
                        <td>Поступлений: ${money(f.paid)}</td>
                        <td class="amount-cell income" style="text-align:right">+${money(f.paid)}</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colspan="3"></td>
                        <td>Расходов: ${money(f.expenses)}</td>
                        <td class="amount-cell expense" style="text-align:right">−${money(f.expenses)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  ` : ""}
                </table>
              </div>

            </section>

            ${renderSummary()}
          </div>
        `;
      }

      function renderPaymentCard(payment) {
        return `
          <article class="finance-card">
            <div class="grid two">
              ${field("Название", `<input data-autosave data-scope="payment" data-id="${payment.id}" data-key="title" value="${escapeHtml(payment.title)}">`)}
              ${field("Сумма", `<input type="number" data-autosave data-scope="payment" data-id="${payment.id}" data-key="amount" value="${escapeHtml(payment.amount)}">`)}
              ${field("Дата", `<input type="date" data-autosave data-scope="payment" data-id="${payment.id}" data-key="date" value="${escapeHtml(payment.date)}">`)}
              ${field("Метод", `<input data-autosave data-scope="payment" data-id="${payment.id}" data-key="method" value="${escapeHtml(payment.method)}">`)}
            </div>
            <div style="margin-top:10px">${field("Комментарий", `<textarea data-autosave data-scope="payment" data-id="${payment.id}" data-key="note">${escapeHtml(payment.note)}</textarea>`)}</div>
            <div class="toolbar no-print" style="margin-top:10px">
              <button class="btn danger small" onclick="app.deletePayment('${payment.id}')">Удалить</button>
            </div>
          </article>
        `;
      }

      function renderExpenseCard(expense) {
        return `
          <article class="finance-card">
            <div class="grid two">
              ${field("Название", `<input data-autosave data-scope="expense" data-id="${expense.id}" data-key="title" value="${escapeHtml(expense.title)}">`)}
              ${field("Сумма", `<input type="number" data-autosave data-scope="expense" data-id="${expense.id}" data-key="amount" value="${escapeHtml(expense.amount)}">`)}
              ${field("Дата", `<input type="date" data-autosave data-scope="expense" data-id="${expense.id}" data-key="date" value="${escapeHtml(expense.date)}">`)}
              ${field("Категория", `<input data-autosave data-scope="expense" data-id="${expense.id}" data-key="category" value="${escapeHtml(expense.category)}">`)}
            </div>
            <div style="margin-top:10px">${field("Комментарий", `<textarea data-autosave data-scope="expense" data-id="${expense.id}" data-key="note">${escapeHtml(expense.note)}</textarea>`)}</div>
            <div class="toolbar no-print" style="margin-top:10px">
              <button class="btn danger small" onclick="app.deleteExpense('${expense.id}')">Удалить</button>
            </div>
          </article>
        `;
      }

      function renderTeam() {
        const f = financeTotals();

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Команда проекта</h1>
                <p>Участники проекта, роли, ставки и выплаты.</p>
              </div>
              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.createTeamMember()">+ Участник</button>
                <button class="btn" onclick="app.saveCurrentProject()">Сохранить проект</button>
              </div>
            </div>

            <div class="grid three">
              <div class="calc-box"><h3>Участников</h3><div class="price">${state.team.length}</div></div>
              <div class="calc-box"><h3>Выплаты</h3><div class="price">${money(f.teamPayouts)}</div></div>
              <div class="calc-box"><h3>Не оплачено</h3><div class="price">${money(state.team.filter(x => !x.paid).reduce((s, x) => s + numberValue(x.payout, 0), 0))}</div></div>
            </div>

            <div class="grid three" style="margin-top:18px">
              ${state.team.length ? state.team.map(renderTeamCard).join("") : `<div class="empty">Команда пока не добавлена</div>`}
            </div>
          </div>
        `;
      }

      function renderTeamCard(member) {
        return `
          <article class="team-card">
            ${field("Имя", `<input data-autosave data-scope="team" data-id="${member.id}" data-key="name" value="${escapeHtml(member.name)}">`)}

            <div class="grid two" style="margin-top:10px">
              ${field("Роль", `<input data-autosave data-scope="team" data-id="${member.id}" data-key="role" value="${escapeHtml(member.role)}">`)}
              ${field("Ставка", `<input type="number" data-autosave data-scope="team" data-id="${member.id}" data-key="rate" value="${escapeHtml(member.rate)}">`)}
              ${field("Выплата", `<input type="number" data-autosave data-scope="team" data-id="${member.id}" data-key="payout" value="${escapeHtml(member.payout)}">`)}
              ${field("Оплачено", `
                <select data-autosave data-scope="team" data-id="${member.id}" data-key="paid">
                  ${optionValueHtml("", "Нет", member.paid ? "1" : "")}
                  ${optionValueHtml("1", "Да", member.paid ? "1" : "")}
                </select>
              `)}
            </div>

            <div style="margin-top:10px">
              ${field("Заметка", `<textarea data-autosave data-scope="team" data-id="${member.id}" data-key="note">${escapeHtml(member.note)}</textarea>`)}
            </div>

            <div class="toolbar no-print" style="margin-top:10px">
              <button class="btn danger small" onclick="app.deleteTeamMember('${member.id}')">Удалить</button>
            </div>
          </article>
        `;
      }

      function renderCalendar() {
        const today = todayIso();
        const events = [
          ...(state.project.deadline ? [{ type: "Проект", title: `Дедлайн: ${state.project.name}`, date: state.project.deadline, meta: state.project.client || "", clickable: false }] : []),
          ...state.tasks.filter(x => x.deadline).map(task => ({ type: "Задача", title: task.title, date: task.deadline, meta: `${task.status} · ${task.assignee || "без ответственного"}`, taskId: task.id, clickable: true })),
          ...state.payments.filter(x => x.date).map(payment => ({ type: "Платёж", title: payment.title, date: payment.date, meta: money(payment.amount), clickable: false })),
          ...state.expenses.filter(x => x.date).map(expense => ({ type: "Расход", title: expense.title, date: expense.date, meta: money(expense.amount), clickable: false }))
        ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

        function calDateClass(date) {
          if (date < today) return "color:var(--red)";
          const diff = (new Date(date) - new Date(today)) / 86400000;
          if (diff <= 3) return "color:var(--orange)";
          return "color:var(--muted)";
        }

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Календарь</h1>
                <p>Сегодня: <strong>${formatDate(today)}</strong> · Все даты текущего проекта.</p>
              </div>
              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.createTask()">+ Задача</button>
                <button class="btn" onclick="app.setDealView('tasks')">Все задачи</button>
              </div>
            </div>

            <div class="list">
              ${events.length ? events.map(event => `
                <article class="calendar-card" ${event.clickable ? `style="cursor:pointer" onclick="app.openTaskModal('${event.taskId}')" title="Открыть задачу"` : ""}>
                  <div class="line-head">
                    <div>
                      <h3>${escapeHtml(event.title)}</h3>
                      <p>${escapeHtml(event.meta)}</p>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                      <span class="status-pill" style="font-size:10px">${escapeHtml(event.type)}</span>
                      <span style="font-size:12px;font-weight:850;${calDateClass(event.date)}">${event.date === today ? "Сегодня" : escapeHtml(formatDate(event.date))}</span>
                    </div>
                  </div>
                </article>
              `).join("") : `<div class="empty">Дат пока нет — добавь задачу с дедлайном</div>`}
            </div>
          </div>
        `;
      }

      function renderCrm() {
        const projects = state.savedProjects || [];

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>CRM</h1>
                <p>Воронка сохранённых проектов по CRM-статусам.</p>
              </div>
              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.saveCurrentProject()">Сохранить текущий в CRM</button>
                <button class="btn" onclick="app.go('projects')">Список проектов</button>
              </div>
            </div>

            <div class="kanban">
              ${CRM_STATUSES.map(status => {
                const list = projects.filter(project => (project.crmStatus || "Лид") === status);

                return `
                  <div class="kanban-col"
                    ondragover="event.preventDefault();this.classList.add('dragover')"
                    ondragleave="this.classList.remove('dragover')"
                    ondrop="app.onKanbanDrop(event,'${status}','crm');this.classList.remove('dragover')">
                    <h3>${escapeHtml(status)} <span class="pill-count">${list.length}</span></h3>
                    <div class="list">
                      ${list.length ? list.map(project => `
                        <article class="crm-card"
                          draggable="true"
                          ondragstart="app.onKanbanDragStart(event,'${project.id}','crm')"
                          ondragend="document.querySelectorAll('.kanban-col').forEach(c=>c.classList.remove('dragover'))">
                          <h3>${escapeHtml(project.name)}</h3>
                          <p>${escapeHtml(project.client || "Клиент не указан")}</p>
                          <div class="badges">
                            <span class="badge">${money(project.total)}</span>
                            ${project.deadline ? `<span class="badge">${formatDate(project.deadline)}</span>` : ""}
                            <span class="badge">${escapeHtml(project.priority || "")}</span>
                          </div>
                          <div class="toolbar no-print" style="margin-top:10px">
                            <button class="btn primary small" onclick="app.loadSavedProject('${project.id}')">Открыть</button>
                            <button class="btn small" onclick="app.createClientPortal('${project.id}')" title="Создать ссылку КП для клиента">🔗 КП-ссылка</button>
                          </div>
                        </article>
                      `).join("") : `<div class="empty kanban-drop-hint">Пусто</div>`}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }

      function renderProposal() {
        return `
          <div class="panel">
            <div class="section-title no-print client-hidden">
              <div>
                <h1>Коммерческое предложение</h1>
                <p>Клиентская версия сметы с итогами, этапами и условиями.</p>
              </div>

              <div class="toolbar">
                <button class="btn" id="aiProposalBtn" onclick="app.generateProposalAI()" style="background:linear-gradient(135deg,#7c3aed,#2563eb);border-color:transparent;color:#fff">✨ Сгенерировать с ИИ</button>
                <button class="btn" onclick="app.copyProposalText()">Скопировать текст</button>
                <button class="btn blue" onclick="app.downloadProposalPDF()">⬇ PDF</button>
                <button class="btn" onclick="app.printProposal()">Печать</button>
                <button class="btn green" onclick="app.exportXlsx()">Excel</button>
              </div>
            </div>

            <div class="grid three no-print client-hidden">
              ${field("Шаблон", `
                <select data-autosave data-scope="project" data-key="proposalTemplate">
                  ${Object.keys(state.proposalTemplates).map(key => optionValueHtml(key, state.proposalTemplates[key].name, state.project.proposalTemplate)).join("")}
                </select>
              `)}
              ${field("Режим", `
                <select data-autosave data-scope="project" data-key="proposalMode">
                  ${optionValueHtml("detailed", "Подробный", state.project.proposalMode)}
                  ${optionValueHtml("short", "Краткий", state.project.proposalMode)}
                </select>
              `)}
              ${field("Налог", `
                <select data-autosave data-scope="project" data-key="taxType">
                  ${taxOptionsHtml(state.project.taxType)}
                </select>
              `)}
            </div>

            <div class="grid two no-print client-hidden" style="margin-top:14px">
              ${field("Условия оплаты", `<textarea data-autosave data-scope="project" data-key="paymentTerms">${escapeHtml(state.project.paymentTerms)}</textarea>`)}
              ${field("Условия передачи", `<textarea data-autosave data-scope="project" data-key="deliveryTerms">${escapeHtml(state.project.deliveryTerms)}</textarea>`)}
            </div>

            <div class="grid two no-print client-hidden" style="margin-top:14px">
              ${field("Включено", `<textarea data-autosave data-scope="project" data-key="includedText">${escapeHtml(state.project.includedText)}</textarea>`)}
              ${field("Не включено", `<textarea data-autosave data-scope="project" data-key="excludedText">${escapeHtml(state.project.excludedText)}</textarea>`)}
            </div>

            <div class="proposal-preview">
              ${renderProposalPrint()}
            </div>
          </div>
        `;
      }

      function renderProposalPrint() {
        const t = totals();
        const template = state.proposalTemplates[state.project.proposalTemplate] || state.proposalTemplates.classic;
        const showDetails = state.project.proposalMode !== "short" && template.showDetails;
        const mainIds = selectedIds().filter(id => !state.selected[id]?.optional);
        const optionalIds = selectedIds().filter(id => state.selected[id]?.optional);
        const client = getCurrentClient();
        const companyLogo = String(state.company.logoUrl || "logo-icon.svg").trim();

        return `
          <div class="proposal">
            <div class="proposal-brand">
              ${companyLogo ? `<img src="${escapeHtml(companyLogo)}" alt="${escapeHtml(state.company.name || "Adervis")}">` : ""}
              <div>
                <h1>${escapeHtml(state.company.name || "Adervis")}</h1>
                <p>${escapeHtml(state.company.desc || "")}</p>
              </div>
            </div>

            <hr>

            <h2>Коммерческое предложение</h2>
            <p>${escapeHtml(template.intro || "")}</p>

            <table>
              <tbody>
                <tr><td><strong>Проект</strong></td><td>${escapeHtml(state.project.name || "Видео-проект")}</td></tr>
                <tr><td><strong>Клиент</strong></td><td>${escapeHtml(state.project.client || client?.name || "Не указан")}</td></tr>
                ${state.project.city ? `<tr><td><strong>Город</strong></td><td>${escapeHtml(state.project.city)}</td></tr>` : ""}
                ${state.project.deadline ? `<tr><td><strong>Дедлайн</strong></td><td>${escapeHtml(formatDate(state.project.deadline))}</td></tr>` : ""}
                ${state.project.manager ? `<tr><td><strong>Менеджер</strong></td><td>${escapeHtml(state.project.manager)}</td></tr>` : ""}
              </tbody>
            </table>

            ${template.showStages ? renderProposalStages(mainIds, showDetails) : renderProposalTable(mainIds, showDetails)}

            ${optionalIds.length && template.showOptional ? `
              <h2>Дополнительные опции</h2>
              <p>Эти позиции не входят в базовую стоимость и могут быть добавлены отдельно.</p>
              ${renderProposalTable(optionalIds, showDetails)}
            ` : ""}

            <h2>Итоги</h2>
            <table>
              <tbody>
                <tr><td>Работы</td><td><strong>${money(t.base)}</strong></td></tr>
                ${t.discount ? `<tr><td>Скидка</td><td><strong>− ${money(t.discount)}</strong></td></tr>` : ""}
                ${t.tax ? `<tr><td>Налог</td><td><strong>${money(t.tax)}</strong></td></tr>` : ""}
                <tr><td><strong>Итого</strong></td><td><strong>${money(t.total)}</strong></td></tr>
                ${t.optional ? `
                  <tr><td>Опции</td><td><strong>${money(t.optional)}</strong></td></tr>
                  <tr><td><strong>Итого с опциями</strong></td><td><strong>${money(t.withOptional)}</strong></td></tr>
                ` : ""}
              </tbody>
            </table>

            ${state.project.budgetComment ? `
              <h2>Комментарий к бюджету</h2>
              <p>${escapeHtml(state.project.budgetComment)}</p>
            ` : ""}

            <h2>Что входит</h2>
            <p>${escapeHtml(state.project.includedText || "")}</p>

            <h2>Что не входит</h2>
            <p>${escapeHtml(state.project.excludedText || "")}</p>

            <h2>Условия</h2>
            <table>
              <tbody>
                <tr><td><strong>Оплата</strong></td><td>${escapeHtml(state.project.paymentTerms || "")}</td></tr>
                <tr><td><strong>Передача материалов</strong></td><td>${escapeHtml(state.project.deliveryTerms || "")}</td></tr>
                <tr><td><strong>Примечание</strong></td><td>${escapeHtml(state.project.proposalNote || "")}</td></tr>
              </tbody>
            </table>

            ${state.company.details || state.company.terms || state.company.requisites ? `
              <h2>Информация о компании</h2>
              ${state.company.details ? `<p>${escapeHtml(state.company.details)}</p>` : ""}
              ${state.company.terms ? `<p>${escapeHtml(state.company.terms)}</p>` : ""}
              ${state.company.requisites ? `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(state.company.requisites)}</pre>` : ""}
            ` : ""}

            <p style="margin-top:32px;color:#6b7280">
              КП сформировано в ADERVIS CRM ${escapeHtml(APP_VERSION)} · ${escapeHtml(formatDate(new Date().toISOString()))}
            </p>
          </div>
        `;
      }

      function renderProposalStages(ids, showDetails) {
        if (!ids.length) return `<div class="empty">В смете пока нет основных позиций</div>`;

        return state.stages.map(stage => {
          const stageIds = ids.filter(id => {
            const itemData = findItem(id, true);
            const line = state.selected[id];
            return itemData && line && (line.stageId || itemData.stage) === stage.id;
          });

          if (!stageIds.length) return "";

          return `
            <h2>${escapeHtml(stage.name)}</h2>
            ${stage.desc ? `<p>${escapeHtml(stage.desc)}</p>` : ""}
            ${renderProposalTable(stageIds, showDetails)}
          `;
        }).join("");
      }

      function renderProposalLineDetails(id) {
        const itemData = findItem(id, true);
        const line = state.selected[id];

        if (!itemData || !line) return "";
        if (itemData.calcModel !== "videoEdit") return "";

        const breakdown = lineBreakdown(id);
        if (!breakdown.rows.length) return "";

        return `
          <br>
          <span style="color:#6b7280;font-size:12px">
            Расчёт: ${breakdown.rows.map(row => `${escapeHtml(row.label)} — ${money(row.value)}`).join("; ")}
          </span>
        `;
      }

      function renderProposalTable(ids, showDetails) {
        if (!ids.length) return "";

        return `
          <table>
            <thead>
              <tr>
                <th>Позиция</th>
                ${showDetails ? `<th>Описание</th>` : ""}
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              ${ids.map(id => {
                const itemData = findItem(id, true);
                const line = state.selected[id];
                if (!itemData || !line) return "";

                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(line.lineName || itemData.name)}</strong>
                      ${line.clientComment ? `<br><span style="color:#6b7280">${escapeHtml(line.clientComment)}</span>` : ""}
                    </td>
                    ${showDetails ? `<td>${escapeHtml(line.editedDesc || itemData.desc || "")}${renderProposalLineDetails(id)}</td>` : ""}
                    <td><strong>${money(lineTotal(id))}</strong></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        `;
      }

      function renderVersions() {
        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Версии сметы</h1>
                <p>Контрольные точки: сохраняй версии при важных изменениях и возвращайся к ним в один клик.</p>
              </div>

              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.createVersion()">+ Сохранить текущую версию</button>
                <button class="btn" onclick="app.go('projects')">Проекты</button>
              </div>
            </div>

            ${state.versions.length ? `
              <div class="grid three">
                ${state.versions.map(version => `
                  <article class="project-card">
                    <div class="line-head">
                      <div>
                        <h3>${escapeHtml(version.name)}</h3>
                        <p>${escapeHtml(formatDate(version.at))}</p>
                      </div>
                      <div class="price" style="font-size:18px">${money(version.total)}</div>
                    </div>

                    <div class="badges" style="margin-top:10px">
                      <span class="badge">${Object.keys(version.selected || {}).length} позиций</span>
                      ${version.project?.client ? `<span class="badge">${escapeHtml(version.project.client)}</span>` : ""}
                      ${version.project?.status ? `<span class="status-pill">${escapeHtml(version.project.status)}</span>` : ""}
                    </div>

                    <div class="metric-grid" style="margin-top:10px">
                      <div class="metric"><span>Сумма</span><strong>${money(version.total)}</strong></div>
                      <div class="metric"><span>Позиций</span><strong>${Object.keys(version.selected || {}).length}</strong></div>
                      <div class="metric"><span>Задач</span><strong>${(version.tasks || []).length}</strong></div>
                    </div>

                    <div class="toolbar no-print" style="margin-top:14px">
                      <button class="btn primary" onclick="app.restoreVersion('${version.id}')">Восстановить</button>
                      <button class="btn danger" onclick="app.deleteVersion('${version.id}')">Удалить</button>
                    </div>
                  </article>
                `).join("")}
              </div>
            ` : `
              <div class="empty">
                Версий пока нет. Нажми «+ Сохранить текущую версию», чтобы зафиксировать состояние сметы.
              </div>
            `}
          </div>
        `;
      }

      function renderGlobalFinances() {
        const allTxs = getAllTransactions();
        const filteredByDate = filterByDateRange(allTxs);
        const monthly = getMonthlyAnalytics(filteredByDate);
        const gFilter = state.gFinFilter || "all";
        const typeFilter = state.gFinTypeFilter || "all";

        const filtered = allTxs.filter(tx => {
          if (gFilter !== "all" && tx.projectId !== gFilter) return false;
          if (typeFilter === "income" && tx._type !== "income") return false;
          if (typeFilter === "expense" && tx._type !== "expense") return false;
          return true;
        });

        const totalIncome = allTxs.filter(t => t._type === "income").reduce((s, t) => s + numberValue(t.amount, 0), 0);
        const totalExpense = allTxs.filter(t => t._type === "expense").reduce((s, t) => s + numberValue(t.amount, 0), 0);
        const totalProfit = totalIncome - totalExpense;
        const allDebt = (state.savedProjects || []).reduce((s, p) => s + numberValue(p.debt, 0), 0);

        const maxBar = Math.max(...monthly.map(m => Math.max(m.income, m.expense)), 1);

        const projects = [{ id: "all", name: "Все проекты" }, ...
          [state.activeProjectId ? { id: state.activeProjectId, name: state.project.name || "Текущий" } : null,
           ...(state.savedProjects || []).filter(p => p.id !== state.activeProjectId).map(p => ({ id: p.id, name: p.name }))
          ].filter(Boolean)
        ];

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Финансы</h1>
                <p>Все поступления и расходы по всем проектам.</p>
              </div>
              <div class="toolbar no-print">
                <button class="btn green" onclick="app.exportXlsx()">Excel</button>
              </div>
            </div>

            <div class="fin-summary-grid" style="margin-bottom:20px">
              <div class="fin-card income-card">
                <h3>Всего получено</h3>
                <div class="fin-amount">${money(totalIncome)}</div>
                <div class="fin-sub">по всем проектам</div>
              </div>
              <div class="fin-card expense-card">
                <h3>Всего расходов</h3>
                <div class="fin-amount">${money(totalExpense)}</div>
                <div class="fin-sub">по всем проектам</div>
              </div>
              <div class="fin-card profit-card">
                <h3>Прибыль</h3>
                <div class="fin-amount">${money(totalProfit)}</div>
                <div class="fin-sub">доход − расходы</div>
              </div>
              <div class="fin-card ${allDebt > 0 ? "expense-card" : "income-card"}">
                <h3>Общий долг</h3>
                <div class="fin-amount" style="color:${allDebt > 0 ? "var(--orange)" : "var(--green)"}">${money(allDebt)}</div>
                <div class="fin-sub">ещё не оплачено</div>
              </div>
              <div class="fin-card">
                <h3>Транзакций</h3>
                <div class="fin-amount">${allTxs.length}</div>
                <div class="fin-sub">${allTxs.filter(t=>t._type==="income").length} поступл. · ${allTxs.filter(t=>t._type==="expense").length} расх.</div>
              </div>
            </div>

            <div class="fin-subtab-bar no-print">
              <button class="fin-subtab ${(state.gFinSubTab||"transactions")==="transactions"?"active":""}" onclick="app.setGFinSubTab('transactions')">Транзакции</button>
              <button class="fin-subtab ${state.gFinSubTab==="analytics"?"active":""}" onclick="app.setGFinSubTab('analytics')">Аналитика</button>
            </div>

            ${state.gFinSubTab === "analytics" ? `
              <div class="analytics-date-bar no-print">
                <span style="font-size:12px;color:var(--muted);font-weight:750;margin-right:4px">Период:</span>
                ${[
                  ["all", "Всё время"],
                  ["month", "Этот месяц"],
                  ["3months", "3 месяца"],
                  ["quarter", "Квартал"],
                  ["year", "Год"],
                  ["custom", "Свой"]
                ].map(([k, l]) => `
                  <button class="date-preset-btn ${(state.gFinDatePreset||"all")===k?"active":""}" onclick="app.setGFinDatePreset('${k}')">${l}</button>
                `).join("")}
                ${state.gFinDatePreset === "custom" ? `
                  <div class="date-range-inputs">
                    <input type="date" value="${escapeHtml(state.gFinDateFrom)}" onchange="app.setGFinDateFrom(this.value)" title="С">
                    <span style="color:var(--muted)">—</span>
                    <input type="date" value="${escapeHtml(state.gFinDateTo)}" onchange="app.setGFinDateTo(this.value)" title="По">
                  </div>
                ` : ""}
              </div>
              ${monthly.length > 0 ? `
                <div class="analytics-section">
                  <h3>Доход и расходы по месяцам</h3>
                  <div style="display:flex;align-items:flex-end;gap:6px;overflow-x:auto;padding-bottom:4px">
                    ${monthly.map(m => {
                      const incH = Math.max(2, Math.round(m.income / maxBar * 120));
                      const expH = Math.max(2, Math.round(m.expense / maxBar * 120));
                      const profH = Math.max(0, Math.round((m.income - m.expense) / maxBar * 120));
                      const label = m.label.slice(5) + "/" + m.label.slice(2, 4);
                      return `
                        <div class="gfin-month-col" title="${m.label}: +${money(m.income)} −${money(m.expense)}">
                          <div style="display:flex;gap:2px;align-items:flex-end;height:120px">
                            <div class="gfin-bar income" style="height:${incH}px;min-width:10px;opacity:.9"></div>
                            <div class="gfin-bar expense" style="height:${expH}px;min-width:10px;opacity:.7"></div>
                            ${profH > 0 ? `<div class="gfin-bar" style="height:${profH}px;min-width:6px;background:var(--primary2);opacity:.5;border-radius:4px 4px 0 0"></div>` : ""}
                          </div>
                          <div class="gfin-month-label">${label}</div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                  <div style="display:flex;gap:16px;font-size:11px;color:var(--muted);margin-top:8px">
                    <span><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px;margin-right:4px"></span>Поступления</span>
                    <span><span style="display:inline-block;width:10px;height:10px;background:var(--red);opacity:.7;border-radius:2px;margin-right:4px"></span>Расходы</span>
                    <span><span style="display:inline-block;width:10px;height:10px;background:var(--primary2);opacity:.5;border-radius:2px;margin-right:4px"></span>Прибыль</span>
                  </div>
                </div>
              ` : ""}

              <div class="grid two">
                <div class="analytics-section">
                  <h3>Поступления по статьям</h3>
                  ${(() => {
                    const byArticle = {};
                    filteredByDate.filter(t => t._type === "income").forEach(t => {
                      const k = t.method || "Не указано"; byArticle[k] = (byArticle[k] || 0) + numberValue(t.amount, 0);
                    });
                    const total = Object.values(byArticle).reduce((s, v) => s + v, 0) || 1;
                    return Object.entries(byArticle).sort((a,b) => b[1]-a[1]).map(([k, v]) => `
                      <div class="category-bar-item">
                        <div class="category-bar-label">${escapeHtml(k)}</div>
                        <div style="flex:2;background:var(--line);border-radius:999px;height:8px;overflow:hidden">
                          <div class="category-bar-fill" style="background:var(--green);width:${Math.round(v/total*100)}%"></div>
                        </div>
                        <div class="category-bar-amount">${money(v)}</div>
                      </div>
                    `).join("") || `<p style="color:var(--muted);font-size:13px">Нет данных</p>`;
                  })()}
                </div>
                <div class="analytics-section">
                  <h3>Расходы по категориям</h3>
                  ${(() => {
                    const byCat = {};
                    filteredByDate.filter(t => t._type === "expense").forEach(t => {
                      const k = t.category || "Прочее"; byCat[k] = (byCat[k] || 0) + numberValue(t.amount, 0);
                    });
                    const total = Object.values(byCat).reduce((s, v) => s + v, 0) || 1;
                    return Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([k, v]) => `
                      <div class="category-bar-item">
                        <div class="category-bar-label">${escapeHtml(k)}</div>
                        <div style="flex:2;background:var(--line);border-radius:999px;height:8px;overflow:hidden">
                          <div class="category-bar-fill" style="background:var(--red);width:${Math.round(v/total*100)}%"></div>
                        </div>
                        <div class="category-bar-amount">${money(v)}</div>
                      </div>
                    `).join("") || `<p style="color:var(--muted);font-size:13px">Нет данных</p>`;
                  })()}
                </div>
              </div>

              <div class="analytics-section">
                <h3>Прибыль по проектам (топ-10)</h3>
                ${(() => {
                  const byProj = [];
                  state.savedProjects.slice(0, 10).forEach(p => {
                    byProj.push({ name: p.name, profit: p.profit || 0, total: p.total || 0 });
                  });
                  const maxProfit = Math.max(...byProj.map(p => Math.abs(p.profit)), 1);
                  return byProj.sort((a,b) => b.profit - a.profit).map(p => `
                    <div class="category-bar-item">
                      <div class="category-bar-label" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name)}</div>
                      <div style="flex:2;background:var(--line);border-radius:999px;height:8px;overflow:hidden">
                        <div class="category-bar-fill" style="background:${p.profit >= 0 ? "var(--primary2)" : "var(--red)"};width:${Math.round(Math.abs(p.profit)/maxProfit*100)}%"></div>
                      </div>
                      <div class="category-bar-amount" style="color:${p.profit >= 0 ? "var(--primary2)" : "var(--red)"}">${money(p.profit)}</div>
                    </div>
                  `).join("") || `<p style="color:var(--muted);font-size:13px">Нет данных</p>`;
                })()}
              </div>
            ` : ""}

            ${(state.gFinSubTab || "transactions") === "transactions" ? `
            <div class="fin-action-bar no-print" style="margin-bottom:12px">
              <select onchange="app.setGFinFilter(this.value)" style="padding:8px 12px;border-radius:10px;font-size:13px">
                ${projects.map(p => `<option value="${p.id}" ${gFilter===p.id?"selected":""}>${escapeHtml(p.name)}</option>`).join("")}
              </select>
              <select onchange="app.setGFinTypeFilter(this.value)" style="padding:8px 12px;border-radius:10px;font-size:13px">
                <option value="all" ${typeFilter==="all"?"selected":""}>Все операции</option>
                <option value="income" ${typeFilter==="income"?"selected":""}>Только поступления</option>
                <option value="expense" ${typeFilter==="expense"?"selected":""}>Только расходы</option>
              </select>
              <span style="font-size:12px;color:var(--muted)">${filtered.length} операций · ${money(filtered.filter(t=>t._type==="income").reduce((s,t)=>s+numberValue(t.amount,0),0))} получено · ${money(filtered.filter(t=>t._type==="expense").reduce((s,t)=>s+numberValue(t.amount,0),0))} расходов</span>
            </div>

            <div class="fin-table-wrap">
              <table class="fin-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Проект</th>
                    <th>Описание</th>
                    <th>Категория / статья</th>
                    <th>Тип</th>
                    <th style="text-align:right">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered.length ? filtered.map(tx => `
                    <tr style="cursor:pointer" title="Нажми для редактирования" onclick="app.openEditTransaction('${tx.id}','${tx._type}','${tx.projectId}')">
                      <td style="color:var(--muted);font-size:12px;white-space:nowrap">${escapeHtml(formatDate(tx.date))}</td>
                      <td style="font-size:12px;font-weight:750;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(tx.projectName || "—")}</td>
                      <td style="max-width:200px">${escapeHtml(tx.title)}</td>
                      <td style="font-size:12px">
                        ${tx._type === "income"
                          ? `<span class="type-badge income">${escapeHtml(tx.method || "")}</span>`
                          : tx.category ? `<span class="fin-category-badge">${escapeHtml(tx.category)}</span>` : "—"
                        }
                      </td>
                      <td><span class="type-badge ${tx._type === "income" ? "income" : "expense"}">${tx._type === "income" ? "Поступление" : "Расход"}</span></td>
                      <td class="amount-cell ${tx._type === "income" ? "income" : "expense"}">${tx._type === "income" ? "+" : "−"}${money(tx.amount)}</td>
                    </tr>
                  `).join("") : `
                    <tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">Нет транзакций. Добавь поступление или расход.</td></tr>
                  `}
                </tbody>
                ${filtered.length ? `
                  <tfoot class="fin-table-footer">
                    <tr>
                      <td colspan="5" style="font-size:12px;color:var(--muted)">Итого получено</td>
                      <td class="amount-cell income" style="text-align:right">+${money(filtered.filter(t=>t._type==="income").reduce((s,t)=>s+numberValue(t.amount,0),0))}</td>
                    </tr>
                    <tr>
                      <td colspan="5" style="font-size:12px;color:var(--muted)">Итого расходов</td>
                      <td class="amount-cell expense" style="text-align:right">−${money(filtered.filter(t=>t._type==="expense").reduce((s,t)=>s+numberValue(t.amount,0),0))}</td>
                    </tr>
                  </tfoot>
                ` : ""}
              </table>
            </div>
            ` : ""}
          </div>
        `;
      }

      function renderGlobalCalendar() {
        const today = todayIso();
        const calMonth = state.calendarMonth || today.slice(0, 7);
        const selDay = state.calendarSelectedDay || "";
        const calAllMode = state.calAllMode || false;
        const calTypeFilter = state.calTypeFilter || "all";

        const [yr, mo] = calMonth.split("-").map(Number);
        const monthNames = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

        /* Собираем все события */
        const events = [];
        state.savedProjects.forEach(proj => {
          const snap = proj.snapshot || {};
          if (proj.deadline) events.push({ date: proj.deadline, title: `Дедлайн: ${proj.name}`, type: "deadline", project: proj.name, projectId: proj.id });
          (snap.tasks || []).filter(t => t.deadline).forEach(t => events.push({ date: t.deadline, title: t.title, type: "task", project: proj.name, projectId: proj.id }));
          (snap.payments || []).filter(p => p.date).forEach(p => events.push({ date: p.date, title: p.title, type: "payment", project: proj.name, projectId: proj.id, amount: p.amount }));
          (snap.expenses || []).filter(e => e.date).forEach(e => events.push({ date: e.date, title: e.title, type: "expense", project: proj.name, projectId: proj.id, amount: e.amount }));
        });
        if (state.activeProjectId) {
          if (state.project.deadline) events.push({ date: state.project.deadline, title: `Дедлайн: ${state.project.name}`, type: "deadline", project: state.project.name, projectId: state.activeProjectId });
          state.tasks.filter(t => t.deadline).forEach(t => { if (!events.find(e => e.title === t.title && e.date === t.deadline)) events.push({ date: t.deadline, title: t.title, type: "task", project: state.project.name, projectId: state.activeProjectId }); });
          state.payments.filter(p => p.date).forEach(p => events.push({ date: p.date, title: p.title, type: "payment", project: state.project.name, projectId: state.activeProjectId, amount: p.amount }));
          state.expenses.filter(e => e.date).forEach(e => events.push({ date: e.date, title: e.title, type: "expense", project: state.project.name, projectId: state.activeProjectId, amount: e.amount }));
        }

        /* Индекс событий по дате */
        const eventsByDay = {};
        events.forEach(ev => {
          if (!ev.date) return;
          if (!eventsByDay[ev.date]) eventsByDay[ev.date] = [];
          eventsByDay[ev.date].push(ev);
        });

        /* Строим сетку */
        const firstDay = new Date(yr, mo - 1, 1);
        const lastDay = new Date(yr, mo, 0);
        const startDow = (firstDay.getDay() + 6) % 7; // Пн=0
        const totalDays = lastDay.getDate();

        const cells = [];
        for (let i = 0; i < startDow; i++) {
          const d = new Date(yr, mo - 1, -startDow + i + 1);
          cells.push({ day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(), other: true });
        }
        for (let d = 1; d <= totalDays; d++) cells.push({ day: d, month: mo, year: yr, other: false });
        const remaining = (7 - cells.length % 7) % 7;
        for (let i = 1; i <= remaining; i++) cells.push({ day: i, month: mo % 12 + 1, year: mo === 12 ? yr + 1 : yr, other: true });

        function padZ(n) { return String(n).padStart(2, "0"); }
        function cellDate(c) { return `${c.year}-${padZ(c.month)}-${padZ(c.day)}`; }

        /* Предыдущий/следующий месяц и год */
        function prevMonth() { const d = new Date(yr, mo - 2, 1); return `${d.getFullYear()}-${padZ(d.getMonth()+1)}`; }
        function nextMonth() { const d = new Date(yr, mo, 1); return `${d.getFullYear()}-${padZ(d.getMonth()+1)}`; }
        function prevYear() { return `${yr - 1}-${padZ(mo)}`; }
        function nextYear() { return `${yr + 1}-${padZ(mo)}`; }

        /* События выбранного дня */
        const selEvents = selDay ? (eventsByDay[selDay] || []) : [];

        const typeLabel = { deadline: "Дедлайн", task: "Задача", payment: "Платёж", expense: "Расход" };
        const typeColor = { deadline: "var(--red)", task: "var(--blue)", payment: "var(--green)", expense: "var(--orange)" };

        setTimeout(() => {
          const scroller = document.getElementById("calMonthsScroll");
          const activePill = scroller?.querySelector(".cal-month-pill.active");
          if (activePill) activePill.scrollIntoView({ inline: "center", block: "nearest" });
        }, 0);

        return `
          <div class="panel">
            <!-- Шапка: заголовок + кнопка задачи -->
            <div class="cal-header">
              <div class="cal-header-title">
                <h1>Календарь</h1>
                <p class="cal-header-sub">Дедлайны, задачи и финансы по всем проектам.</p>
              </div>
              <button class="btn primary cal-add-btn" onclick="app.createTask()">+ Задача</button>
            </div>

            <!-- Навигация: месяц/год ← → + Сегодня -->
            <div class="cal-nav2">
              <div class="cal-nav2-center">
                <button class="cal-nav2-arrow" onclick="app.calSetMonth('${calAllMode ? prevYear() : prevMonth()}')" title="${calAllMode ? "Предыдущий год" : "Предыдущий месяц"}">‹</button>
                <span class="cal-nav2-month">${calAllMode ? yr : `${monthNames[mo - 1]} ${yr}`}</span>
                <button class="cal-nav2-arrow" onclick="app.calSetMonth('${calAllMode ? nextYear() : nextMonth()}')" title="${calAllMode ? "Следующий год" : "Следующий месяц"}">›</button>
              </div>
              <button class="cal-nav2-today" onclick="app.calSetMonth('${today.slice(0,7)}');app.calSelectDay('${today}');app.calSetAllMode(false)">Сегодня</button>
            </div>

            <!-- Быстрый выбор месяца (горизонтальный скролл) -->
            <div class="cal-months-scroll" id="calMonthsScroll">
              <button class="cal-month-pill ${calAllMode ? "active" : ""}" onclick="app.calSetAllMode(true)">Весь год</button>
              ${monthNames.map((name, i) => {
                const mIdx = i + 1;
                const mKey = `${yr}-${padZ(mIdx)}`;
                const isActive = !calAllMode && mo === mIdx;
                return `<button class="cal-month-pill ${isActive ? "active" : ""}" onclick="app.calSetMonth('${mKey}');app.calSetAllMode(false)">${name.slice(0,3)}</button>`;
              }).join("")}
            </div>

            <!-- Дни недели -->
            <div class="cal-weekdays">
              ${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d,i) => `<div class="cal-weekday ${i>=5 ? "weekend" : ""}">${d}</div>`).join("")}
            </div>

            <!-- Сетка дней -->
            <div class="cal-grid-wrap">
              ${cells.map(c => {
                const iso = cellDate(c);
                const dayEvs = eventsByDay[iso] || [];
                const isToday = iso === today;
                const isSel = iso === selDay;
                const isWeekend = (cells.indexOf(c) % 7) >= 5;
                const classes = `cal-cell ${c.other ? "other-month" : ""} ${isToday ? "today" : ""} ${isSel ? "selected" : ""} ${isWeekend && !c.other ? "weekend" : ""}`;
                const MAX_LABELS = 2;
                return `
                  <div class="${classes}" onclick="app.calSelectDay('${iso}')" title="${iso}">
                    <span class="cal-day-num">${c.day}</span>
                    <div class="cal-dots">
                      ${dayEvs.slice(0, 4).map(ev => `<span class="cal-dot-item ${ev.type}" title="${escapeHtml(ev.title)}"></span>`).join("")}
                    </div>
                    ${dayEvs.slice(0, MAX_LABELS).map(ev => `<span class="cal-event-label ${ev.type}">${escapeHtml(ev.title.slice(0,22))}</span>`).join("")}
                    ${dayEvs.length > MAX_LABELS ? `<span style="font-size:9px;color:var(--muted);display:block;margin-top:1px">+${dayEvs.length - MAX_LABELS} ещё</span>` : ""}
                  </div>
                `;
              }).join("")}
            </div>

            <!-- Легенда -->
            <div class="cal-legend">
              <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--red)"></div>Дедлайн</div>
              <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--blue)"></div>Задача</div>
              <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--green)"></div>Поступление</div>
              <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--orange)"></div>Расход</div>
              <div class="cal-legend-item" style="margin-left:auto;font-size:11px;color:var(--muted)">Всего событий: ${events.length}</div>
            </div>

            <!-- Selected day panel -->
            ${selDay ? `
              <div class="cal-day-panel">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                  <h3 style="margin:0;font-size:15px">${formatDate(selDay)}${selDay === today ? " — Сегодня" : ""}</h3>
                  <button class="btn small" onclick="app.calSelectDay('')">×</button>
                </div>
                ${selEvents.length ? selEvents.map(ev => `
                  <div class="cal-day-event-row" style="cursor:${ev.projectId ? "pointer" : "default"}"
                    onclick="${ev.type === "task" && ev.projectId ? `app.openDealTasks('${ev.projectId}')` : ev.projectId ? `app.openDeal('${ev.projectId}')` : ""}">
                    <div class="cal-day-event-type" style="background:${typeColor[ev.type]}"></div>
                    <div class="cal-day-event-info">
                      <h4>${escapeHtml(ev.title)}</h4>
                      <p>${escapeHtml(ev.project || "")}${ev.amount ? ` · ${money(ev.amount)}` : ""} · <span style="color:${typeColor[ev.type]};font-weight:750">${typeLabel[ev.type] || ""}</span></p>
                    </div>
                    ${ev.projectId ? `<span style="font-size:11px;color:var(--muted)">→</span>` : ""}
                  </div>
                `).join("") : `<div class="empty" style="padding:12px">Событий нет</div>`}
              </div>
            ` : ""}

            <!-- Events list with All/Month toggle + type filter -->
            ${(() => {
              const typeFilters = [
                { id: "all", label: "Все" },
                { id: "deadline", label: "Дедлайны" },
                { id: "task", label: "Задачи" },
                { id: "payment", label: "Платежи" },
                { id: "expense", label: "Расходы" },
              ];
              const listEvents = (calAllMode ? [...events] : events.filter(ev => ev.date && ev.date.startsWith(`${yr}-${padZ(mo)}`)))
                .filter(ev => calTypeFilter === "all" || ev.type === calTypeFilter)
                .sort((a,b) => a.date.localeCompare(b.date));
              return `
              <div style="margin-top:18px">
                <!-- Фильтр по типу + счётчик -->
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:12px">
                  <span style="font-size:12px;font-weight:750;color:var(--muted);margin-right:2px">${calAllMode ? yr + " год" : monthNames[mo-1] + " " + yr}:</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    ${typeFilters.map(f => `<button style="padding:4px 10px;font-size:11px;font-weight:750;border-radius:99px;border:1px solid ${calTypeFilter===f.id?"var(--primary)":"var(--line)"};background:${calTypeFilter===f.id?"rgba(124,58,237,.15)":"transparent"};color:${calTypeFilter===f.id?"var(--primary2)":"var(--muted)"};cursor:pointer" onclick="app.calSetTypeFilter('${f.id}')">${escapeHtml(f.label)}</button>`).join("")}
                  </div>
                  <span style="font-size:11px;color:var(--muted);margin-left:auto">${listEvents.length} событий</span>
                </div>
                ${!listEvents.length
                  ? `<p style="text-align:center;color:var(--muted);font-size:13px;padding:16px 0">Нет событий${calTypeFilter!=="all"?" по выбранному типу":calAllMode?"":" в этом месяце"}. Нажми на день, чтобы добавить задачу.</p>`
                  : `<div style="display:flex;flex-direction:column;gap:6px">
                  ${listEvents.map(ev => {
                    const isToday = ev.date === today;
                    const isPast = ev.date < today;
                    return `
                    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--panel2);border:1px solid ${isToday ? "rgba(124,58,237,.4)" : "var(--line)"};cursor:${ev.projectId ? "pointer" : "default"};transition:.12s"
                      onclick="${ev.type === "task" && ev.projectId ? `app.openDealTasks('${ev.projectId}')` : ev.projectId ? `app.openDeal('${ev.projectId}')` : `app.calSelectDay('${ev.date}')`}">
                      <div style="width:8px;height:8px;border-radius:50%;background:${typeColor[ev.type]};flex:0 0 8px"></div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:750;${isPast&&!isToday?"opacity:.6":""}overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(ev.title)}</div>
                        <div style="font-size:11px;color:var(--muted)">${formatDate(ev.date)}${ev.project ? ` · ${escapeHtml(ev.project)}` : ""}${ev.amount ? ` · ${money(ev.amount)}` : ""}</div>
                      </div>
                      <span style="font-size:10px;color:${typeColor[ev.type]};font-weight:750;flex:0 0 auto;white-space:nowrap">${escapeHtml(typeLabel[ev.type]||"")}</span>
                    </div>`;
                  }).join("")}
                  </div>`
                }
              </div>`;
            })()}
          </div>
        `;
      }

      function renderWelcome() {
        return `
          <div class="welcome-screen">
            <h1>Добро пожаловать в ADERVIS CRM</h1>
            <p>Ведите клиентов от первого звонка до закрытия сделки — смета, КП и финансы в одном месте.</p>

            <div class="welcome-steps">
              <div class="welcome-step">
                <div class="welcome-step-num">1</div>
                <h3>Добавь клиента</h3>
                <p>Введи имя, телефон и компанию. Один клиент — одна сделка.</p>
              </div>
              <div class="welcome-step">
                <div class="welcome-step-num">2</div>
                <h3>Собери смету</h3>
                <p>Выбери пакет или добавь услуги из каталога. Цены адаптируй под задачу.</p>
              </div>
              <div class="welcome-step">
                <div class="welcome-step-num">3</div>
                <h3>Отправь КП</h3>
                <p>Сформируй коммерческое предложение в один клик и отправь клиенту.</p>
              </div>
              <div class="welcome-step">
                <div class="welcome-step-num">4</div>
                <h3>Закрой сделку</h3>
                <p>Веди статусы, фиксируй оплаты, контролируй прибыль по каждому проекту.</p>
              </div>
            </div>

            <button class="btn primary" style="font-size:16px;padding:14px 32px" onclick="app.startWizard()">Создать первую сделку</button>
          </div>
        `;
      }

      function renderWizard() {
        const w = state.wizard;
        if (!w) return renderHome();

        const steps = ["Клиент", "Проект", "Старт"];

        function stepClass(i) {
          if (i + 1 < w.step) return "wstep done";
          if (i + 1 === w.step) return "wstep active";
          return "wstep";
        }

        let body = "";

        if (w.step === 1) {
          const clients = state.clients || [];
          body = `
            <h2 style="margin-bottom:18px">Кто клиент?</h2>

            <div class="grid two" style="margin-bottom:18px">
              <button class="tab ${w.clientMode === "new" ? "active" : ""}" onclick="app.wizardSetData('clientMode','new')">Новый клиент</button>
              <button class="tab ${w.clientMode === "existing" ? "active" : ""}" onclick="app.wizardSetData('clientMode','existing')" ${!clients.length ? "disabled" : ""}>Из базы${clients.length ? ` (${clients.length})` : ""}</button>
            </div>

            ${w.clientMode === "new" ? `
              <div class="grid two">
                ${field("Имя / название *", `<input id="wz_name" value="${escapeHtml(w.name)}" oninput="app.wizardSetField('name',this.value)" placeholder="Иван Петров или ООО Компания">`)}
                ${field("Телефон", `<input id="wz_phone" value="${escapeHtml(w.phone)}" oninput="app.wizardSetField('phone',this.value)" onblur="app.checkPhoneField(this)" placeholder="+7 900 000-00-00">`)}
              </div>
              <div style="margin-top:12px">
                ${field("Компания", `<input value="${escapeHtml(w.company)}" oninput="app.wizardSetField('company',this.value)" placeholder="Название компании (необязательно)">`)}
              </div>
            ` : `
              <div class="client-select-list">
                ${clients.length ? clients.map(c => `
                  <div class="client-select-item ${w.clientId === c.id ? "selected" : ""}" onclick="app.wizardSetData('clientId','${c.id}')">
                    <div>
                      <strong>${escapeHtml(c.name)}</strong>
                      ${c.company ? `<br><small style="color:var(--muted)">${escapeHtml(c.company)}</small>` : ""}
                    </div>
                    <div class="badges">
                      ${c.phone ? `<span class="badge">${escapeHtml(c.phone)}</span>` : ""}
                      <span class="status-pill">${escapeHtml(c.status || "new")}</span>
                    </div>
                  </div>
                `).join("") : `<div class="empty">Клиентов пока нет</div>`}
              </div>
            `}
          `;
        }

        if (w.step === 2) {
          body = `
            <h2 style="margin-bottom:18px">О проекте</h2>
            <div class="grid two">
              ${field("Название проекта *", `<input value="${escapeHtml(w.projectName)}" oninput="app.wizardSetField('projectName',this.value)" placeholder="Рекламный ролик для Компании">`)}
              ${field("Тип проекта", `
                <select onchange="app.wizardSetData('projectType',this.value)">
                  ${["Видео", "Фото", "Motion", "Мероприятие", "Контент-день", "Прочее"].map(t => `<option value="${t}" ${w.projectType === t ? "selected" : ""}>${t}</option>`).join("")}
                </select>
              `)}
            </div>
            <div class="grid two" style="margin-top:12px">
              ${field("Дедлайн", `<input type="date" value="${escapeHtml(w.deadline)}" onchange="app.wizardSetData('deadline',this.value)">`)}
              ${field("Бюджет клиента", `<input value="${escapeHtml(w.budget||"")}" oninput="app.wizardSetField('budget',this.value)" placeholder="Бюджет проекта, ₽">`)}
            </div>
          `;
        }

        if (w.step === 3) {
          const pkgFilter = w.pkgFilter || "all";

          function pkgCategory(pkg) {
            if (pkg.id.startsWith("ai_")) return "ai";
            if (pkg.id.startsWith("event_")) return "event";
            return "video";
          }

          const catLabels = { all: "Все пакеты", video: "Видео / Фото", event: "Мероприятия", ai: "ИИ / AI" };
          const catCounts = {};
          (state.packages || []).forEach(p => {
            const c = pkgCategory(p);
            catCounts[c] = (catCounts[c] || 0) + 1;
          });

          const visiblePkgs = pkgFilter === "all"
            ? (state.packages || [])
            : (state.packages || []).filter(p => pkgCategory(p) === pkgFilter);

          body = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:6px">
              <h2 style="margin:0">Выбери пакет услуг</h2>
              <span class="mini-note">${(state.packages || []).length} пакетов</span>
            </div>
            <p class="mini-note" style="margin-bottom:14px">Смета заполнится автоматически. Цены — стартовые, всё можно скорректировать.</p>

            <div class="tabs" style="margin:0 0 16px">
              ${Object.entries(catLabels).map(([k, label]) => {
                const cnt = k === "all" ? (state.packages || []).length : (catCounts[k] || 0);
                if (k !== "all" && cnt === 0) return "";
                return `<button class="tab ${pkgFilter === k ? "active" : ""}" onclick="app.wizardSetData('pkgFilter','${k}')">${label}${cnt ? ` <span class="pill-count" style="margin-left:4px">${cnt}</span>` : ""}</button>`;
              }).join("")}
            </div>

            <div class="wizard-pkg-grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">
              ${visiblePkgs.map(pkg => {
                const cat = pkgCategory(pkg);
                const catColor = cat === "ai" ? "rgba(124,58,237,.18)" : cat === "event" ? "rgba(8,145,178,.12)" : "rgba(37,99,235,.1)";
                const catLabel = cat === "ai" ? "ИИ" : cat === "event" ? "Мероприятие" : "Видео";
                return `
                  <div class="wizard-pkg-card" onclick="app.finishWizardWithPackage('${pkg.id}')">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:6px">
                      <h3 style="margin:0;font-size:14px">${escapeHtml(pkg.name)}</h3>
                      <span style="font-size:10px;padding:3px 7px;border-radius:999px;background:${catColor};white-space:nowrap;color:var(--muted)">${catLabel}</span>
                    </div>
                    <p style="font-size:12px;color:var(--muted);margin:0 0 8px;line-height:1.4">${escapeHtml(pkg.desc)}</p>
                    <div style="font-size:13px;font-weight:900;color:var(--primary2)">${escapeHtml(pkg.priceLabel || "")}</div>
                    ${pkg.goodFor ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">${escapeHtml(pkg.goodFor)}</div>` : ""}
                  </div>
                `;
              }).join("")}

              <div class="wizard-pkg-card" onclick="app.finishWizard('estimate')"
                style="border-style:dashed;background:transparent;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;min-height:100px">
                <div style="font-size:22px;margin-bottom:8px;opacity:.5">+</div>
                <h3 style="margin:0 0 4px;font-size:14px">Пустая смета</h3>
                <p style="font-size:12px;color:var(--muted);margin:0">Добавь услуги из каталога вручную</p>
              </div>
            </div>
          `;
        }

        return `
          <div class="panel wizard-wrap" style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
              <h1 style="margin:0;font-size:22px">Новая сделка</h1>
              <button class="btn small" onclick="app.cancelWizard()">Отмена</button>
            </div>

            <div class="wizard-progress">
              ${steps.map((s, i) => `
                <div class="${stepClass(i)}">
                  <div class="wstep-num">${i + 1 < w.step ? "&#10003;" : i + 1}</div>
                  <span class="wstep-label">${s}</span>
                </div>
                ${i < steps.length - 1 ? `<div class="wstep-line ${i + 1 < w.step ? "done" : ""}"></div>` : ""}
              `).join("")}
            </div>

            <div class="wizard-body">
              ${body}

              <div class="toolbar no-print" style="margin-top:22px;justify-content:space-between">
                <button class="btn" onclick="app.wizardBack()">${w.step === 1 ? "Отмена" : "← Назад"}</button>
                ${w.step < 3 ? `<button class="btn primary" onclick="app.wizardNext()">Далее →</button>` : ""}
              </div>
            </div>
          </div>
        `;
      }

      function renderDeal() {
        const t = totals();
        const f = financeTotals();
        const paid = f.paid;
        const total = t.total || 1;
        const payPct = Math.min(100, Math.round(paid / total * 100));
        const margin = f.estimateTotal > 0 ? Math.round(f.profit / f.estimateTotal * 100) : 0;

        const marginClass = margin >= 40 ? "good" : margin >= 20 ? "ok" : "bad";
        const marginLabel = margin >= 40 ? "Высокая маржа" : margin >= 20 ? "Средняя маржа" : "Низкая маржа";

        const crmIdx = CRM_STATUSES.indexOf(state.project.crmStatus || "Лид");
        const nextCrm = crmIdx < CRM_STATUSES.length - 1 ? CRM_STATUSES[crmIdx + 1] : null;
        const DEAL_NEXT_ACTIONS = {
          "Лид": "Взять в работу",
          "Бриф": "Отправить КП",
          "КП отправлено": "Получен ответ",
          "Согласование": "Подписать договор",
          "Договор": "Получить предоплату",
          "Предоплата": "Начать работу",
          "В работе": "Сдать проект",
          "Сдано": "Закрыть сделку",
        };
        const nextActionLabel = DEAL_NEXT_ACTIONS[state.project.crmStatus || "Лид"];

        const dealTabs = [
          { id: "finance", label: "Финансы" },
          { id: "estimate", label: "Смета" },
          { id: "tasks", label: `Задачи${state.tasks.length ? " (" + state.tasks.length + ")" : ""}` },
          { id: "calendar", label: "Календарь" },
          { id: "team", label: "Команда" },
          { id: "proposal", label: "КП" },
          { id: "versions", label: "Версии сметы" },
        ];

        const tabContent = {
          estimate: renderEstimate,
          proposal: renderProposal,
          tasks: renderTasks,
          finance: renderFinance,
          team: renderTeam,
          calendar: renderCalendar,
          versions: renderVersions,
        };

        const currentIdx = CRM_STATUSES.indexOf(state.project.crmStatus || "Лид");

        return `
          <div class="deal-bar no-print">
            <div class="deal-compact-row">
              <div class="deal-nav-group">
                <button class="btn small" onclick="app.go('home')">← Сделки</button>
                <div id="dealBarSwitcher">${renderDealSwitcherHtml()}</div>
                ${state.project.client ? `<span class="badge" style="font-size:11px">${escapeHtml(state.project.client)}</span>` : ""}
                <span class="margin-badge ${marginClass}" style="font-size:10px">${margin}% маржа</span>
                <span class="status-pill" style="font-size:11px">${escapeHtml(state.project.crmStatus || "Лид")}</span>
                ${(() => { const u = deadlineUrgency(state.project.deadline); if (!u || u.level === "ok") return ""; return `<span style="font-size:11px;font-weight:800;color:${u.color};background:${u.level==="overdue"||u.level==="critical"?"rgba(220,38,38,.12)":"rgba(202,138,4,.12)"};border:1px solid ${u.level==="overdue"||u.level==="critical"?"rgba(220,38,38,.35)":"rgba(202,138,4,.35)"};padding:3px 9px;border-radius:99px">⚡ ${escapeHtml(u.label)}</span>`; })()}
              </div>

              <div class="deal-actions-group">
                <div class="deal-stats-inline">
                  <div class="deal-stat-item">
                    <span>Итого</span>
                    <strong>${money(t.total)}</strong>
                  </div>
                  <div class="deal-stat-sep"></div>
                  <div class="deal-stat-item" title="${payPct}% оплачено">
                    <span>Оплачено ${payPct}%</span>
                    <strong style="color:${f.paid > 0 ? "var(--green)" : "var(--muted)"}">${money(f.paid)}</strong>
                  </div>
                  ${f.debt > 0 ? `
                    <div class="deal-stat-sep"></div>
                    <div class="deal-stat-item">
                      <span>Долг</span>
                      <strong style="color:var(--orange)">${money(f.debt)}</strong>
                    </div>
                  ` : ""}
                </div>
              </div>
            </div>

            <div class="deal-stage-progress no-print">
              ${CRM_STATUSES.map((s, i) => {
                const isDone = i < currentIdx;
                const isActive = i === currentIdx;
                return `<div class="dsp-step ${isDone ? "done" : ""} ${isActive ? "active" : ""}" onclick="app.updateProject('crmStatus','${s}')" title="${isDone ? "✓ " : ""}${s}">${isDone ? `<div class="dsp-pill">✓ ${s}</div>` : `<div class="dsp-pill">${isActive ? "● " : ""}${s}</div>`}</div>${i < CRM_STATUSES.length - 1 ? `<div class="dsp-line ${isDone ? "done" : ""}"></div>` : ""}`;
              }).join("")}
            </div>

            <div class="deal-tabs" style="margin-top:10px">
              ${dealTabs.map(tab => `
                <button class="deal-tab ${state.dealView === tab.id ? "active" : ""}" onclick="app.setDealView('${tab.id}')" title="${tab.id === "estimate" ? "Смета проекта" : tab.id === "proposal" ? "Коммерческое предложение" : tab.id === "tasks" ? "Задачи и канбан" : tab.id === "finance" ? "Платежи и расходы" : tab.id === "team" ? "Команда проекта" : tab.id === "calendar" ? "Даты проекта" : "Версии сметы"}">${escapeHtml(tab.label)}</button>
              `).join("")}
            </div>
          </div>

          ${(tabContent[state.dealView] || renderEstimate)()}
        `;
      }

      function importCompanyLogo(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
          alert("Выбери файл изображения: SVG, PNG, JPG или WEBP.");
          event.target.value = "";
          return;
        }

        const reader = new FileReader();

        reader.onload = () => {
          state.company.logoUrl = String(reader.result || "");
          save();
          render();
          toast("Логотип загружен");
        };

        reader.readAsDataURL(file);
        event.target.value = "";
      }

      function renderSettings() {
        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Настройки</h1>
                <p>Данные компании, экспорт и импорт данных. Тема и режим клиента — в шапке.</p>
              </div>
            </div>

            <h2>Компания</h2>

            <div class="grid three">
              ${field("Название", `<input data-autosave data-scope="company" data-key="name" value="${escapeHtml(state.company.name)}">`)}
              ${field("Телефон", `<input data-autosave data-scope="company" data-key="phone" value="${escapeHtml(state.company.phone)}">`)}
              ${field("Email", `<input data-autosave data-scope="company" data-key="email" value="${escapeHtml(state.company.email)}">`)}
              ${field("Сайт", `<input data-autosave data-scope="company" data-key="site" value="${escapeHtml(state.company.site)}">`)}
              ${field("Логотип: путь или URL", `<input data-autosave data-scope="company" data-key="logoUrl" value="${escapeHtml(state.company.logoUrl || "logo-icon.svg")}" placeholder="logo-icon.svg">`)}
              ${field("Загрузить логотип", `<input type="file" accept="image/*" onchange="app.importCompanyLogo(event)">`)}
              ${field("Описание", `<input data-autosave data-scope="company" data-key="desc" value="${escapeHtml(state.company.desc)}">`)}
              ${field("Валюта", `
                <div class="currency-select-wrap">
                  <button class="currency-select-btn" onclick="app.toggleCurrencyDd();event.stopPropagation()">
                    <span>${escapeHtml(state.project.currency || "₽")} — ${escapeHtml((CURRENCIES.find(c=>c.code===(state.project.currency||"₽"))||CURRENCIES[0]).label)}</span>
                    <span style="opacity:.5">▾</span>
                  </button>
                  <div class="currency-select-dd" id="currencyDd">
                    ${CURRENCIES.map(c => `<button class="currency-opt ${(state.project.currency||"₽")===c.code?"active":""}" onclick="app.selectCurrency('${c.code}');event.stopPropagation()"><span class="currency-sym">${escapeHtml(c.sym)}</span>${escapeHtml(c.label)}</button>`).join("")}
                  </div>
                </div>
              `)}
            </div>

            <div class="grid two" style="margin-top:14px">
              ${field("Детали компании", `<textarea data-autosave data-scope="company" data-key="details">${escapeHtml(state.company.details)}</textarea>`)}
              ${field("Условия", `<textarea data-autosave data-scope="company" data-key="terms">${escapeHtml(state.company.terms)}</textarea>`)}
            </div>

            <div style="margin-top:14px">
              ${field("Реквизиты", `<textarea data-autosave data-scope="company" data-key="requisites">${escapeHtml(state.company.requisites)}</textarea>`)}
            </div>

            <div class="panel" style="margin-top:18px;box-shadow:none;background:var(--panel2)">
              <h2>Данные</h2>

              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.exportData()">Экспорт JSON</button>
                <button class="btn" onclick="document.getElementById('importJsonInput').click()">Импорт JSON</button>
                <button class="btn green" onclick="app.exportXlsx()">Экспорт Excel</button>
                <button class="btn" onclick="app.printProposal()">Печать / PDF</button>
                <button class="btn" onclick="document.getElementById('importCatalogInput').click()">Импорт каталога</button>
              </div>

              <p class="mini-note">
                JSON сохраняет полностью всё состояние: проекты, клиентов, каталог, цены, версии, задачи, финансы, команду и настройки.
              </p>
            </div>

            ${(!_adminSession || _adminSession.user.email === SUPER_ADMIN_EMAIL) ? `
            <div class="supabase-config-box">
              <h2 style="margin-top:0">🔐 Supabase — авторизация и подписки</h2>
              <p style="margin-bottom:6px;font-size:13px">
                Подключите Supabase для: входа пользователей по email/паролю, облачного хранения данных, управления подписками и совместного редактирования.
              </p>
              <details style="margin-bottom:14px">
                <summary style="cursor:pointer;font-size:12px;color:var(--muted);font-weight:700">📋 SQL — создать таблицы в Supabase (нажмите чтобы раскрыть)</summary>
                <pre style="font-size:10px;background:rgba(0,0,0,.15);border-radius:10px;padding:12px;margin-top:10px;overflow-x:auto;white-space:pre-wrap;line-height:1.5">-- ═══════════════════════════════════════════════════
-- ADERVIS CRM — Схема базы данных v4.2
-- Выполнить один раз в Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Профили пользователей (подписка + принадлежность к агентству)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  agency_id text,                   -- UUID агентства (= id владельца)
  subscription_status text default 'trial',
  subscription_plan text default 'pro',
  subscription_expires_at timestamptz default (now() + interval '14 days'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "profiles: read own" on profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on profiles for update using (auth.uid() = id);

-- 2. Состояние агентства (общий workspace команды)
-- id = agency_id из profiles (= UUID владельца агентства)
create table if not exists agency_state (
  id text primary key,
  state_json jsonb,
  updated_at timestamptz default now()
);
alter table agency_state enable row level security;
-- Пользователь видит только данные своего агентства
create policy "state: read agency" on agency_state for select
  using (id = (select agency_id from profiles where profiles.id = auth.uid()));
create policy "state: insert agency" on agency_state for insert
  with check (id = (select agency_id from profiles where profiles.id = auth.uid()));
create policy "state: update agency" on agency_state for update
  using (id = (select agency_id from profiles where profiles.id = auth.uid()));

-- 3. Migrating: если таблицы уже существуют — добавить agency_id
alter table profiles add column if not exists agency_id text;
-- Заполнить agency_id = id для существующих пользователей
update profiles set agency_id = id::text where agency_id is null;

-- 4. Realtime: Database → Replication → agency_state → Insert+Update</pre>
              </details>
              ${(() => {
                const cfg = getSupabaseConfig();
                return `
                <div class="grid two" style="margin-bottom:14px">
                  <div class="field">
                    <label>Supabase Project URL</label>
                    <input id="sb_url_input" placeholder="https://xxxx.supabase.co" value="${escapeHtml(cfg.url)}">
                  </div>
                  <div class="field">
                    <label>Anon / Public Key</label>
                    <input id="sb_key_input" placeholder="eyJhbGciOi..." value="${escapeHtml(cfg.key)}" type="password">
                  </div>
                </div>
                <div class="grid two" style="margin-bottom:14px">
                  <div class="field">
                    <label>VK App ID <span style="font-size:10px;color:var(--muted)">(для авторизации через VK)</span></label>
                    <input id="vk_app_id_input" placeholder="12345678" value="${escapeHtml((localStorage.getItem('vk_app_id') || _DEFAULT_VK_APP_ID) || '')}">
                  </div>
                </div>
                <div class="toolbar" style="margin-bottom:${_adminSession ? "14px" : "0"}">
                  <button class="btn primary" onclick="app.saveSupabaseConfig()">Сохранить настройки</button>
                  ${cfg.url && cfg.key && !_adminSession ? `<button class="btn" onclick="app.openAdminModal()">🔐 Войти</button>` : ""}
                  ${_adminSession ? `<span class="sync-badge">● Подключено как ${escapeHtml(_adminSession.user.email)}</span>` : ""}
                </div>
                ${_adminSession && _userProfile ? `
                <div style="background:rgba(0,0,0,.06);border-radius:12px;padding:14px;font-size:13px">
                  <strong>Ваша подписка:</strong>
                  <span style="margin-left:8px">${escapeHtml(getSubscriptionLabel())}</span>
                  ${_userProfile.subscription_expires_at ? `<span style="color:var(--muted);margin-left:8px;font-size:11px">до ${escapeHtml(new Date(_userProfile.subscription_expires_at).toLocaleDateString("ru-RU"))}</span>` : ""}
                  <br><br>
                  <strong>Управление пользователями:</strong>
                  <p style="margin:6px 0 0;font-size:12px;line-height:1.5">
                    Для активации подписки клиенту — зайдите в <a href="https://supabase.com/dashboard" target="_blank" style="color:var(--primary)">Supabase Dashboard</a>
                    → Table Editor → profiles → найдите пользователя по email → измените <code>subscription_status</code> на <code>active</code>
                    и <code>subscription_expires_at</code> на дату окончания.
                  </p>
                </div>
                ` : ""}
                `;
              })()}
            </div>
            ` : ""}

            <div style="margin-top:18px;padding:10px 14px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:12px;color:var(--muted)">ADERVIS CRM</span>
              <span style="font-size:11px;color:var(--muted);opacity:.55">v${APP_VERSION}</span>
            </div>

            <div class="panel" style="margin-top:18px;box-shadow:none;background:var(--panel2)">
              <h2>Уведомления (Telegram)</h2>
              <p style="font-size:13px;color:var(--text2);margin-bottom:14px">
                Напишите боту <a href="https://t.me/adervis_crm_bot" target="_blank" style="color:var(--primary)">@adervis_crm_bot</a> команду <code>/start</code> — он пришлёт Chat ID. Добавьте столько получателей, сколько нужно.
              </p>
              ${(state.telegramChatIds || []).map(r => `
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
                  <input placeholder="Имя (необязательно)" value="${escapeHtml(r.name)}"
                    style="flex:1;min-width:120px;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--input);color:var(--text);font-size:13px"
                    oninput="app.setTelegramRecipientField('${r.id}','name',this.value)">
                  <input placeholder="Chat ID" value="${escapeHtml(r.chatId)}"
                    style="flex:1;min-width:130px;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--input);color:var(--text);font-size:13px;font-family:monospace"
                    oninput="app.setTelegramRecipientField('${r.id}','chatId',this.value)">
                  <button class="btn" onclick="app.testTelegramRecipient('${r.id}')" style="font-size:12px;padding:7px 12px">Проверить</button>
                  <button class="btn danger" onclick="app.removeTelegramRecipient('${r.id}')" style="font-size:12px;padding:7px 10px">✕</button>
                </div>
              `).join("")}
              <button class="btn" onclick="app.addTelegramRecipient()" style="margin-top:4px">+ Добавить получателя</button>
              <p style="font-size:12px;color:var(--muted);margin-top:12px">Уведомления: просроченные дедлайны, смена статуса сделки.</p>
            </div>

            <div class="panel" style="margin-top:18px;box-shadow:none;background:var(--panel2);border-color:rgba(220,38,38,.45)">
              <h2>Опасная зона</h2>
              <p>Сброс удалит все локальные данные приложения в браузере.</p>

              <div class="toolbar no-print">
                <button class="btn danger" onclick="app.resetAllData()">Сбросить всё</button>
              </div>
            </div>
          </div>
        `;
      }

      /* ═══════════════════════════════════════════════════════
         УПРАВЛЕНИЕ КАЛЕНДАРЁМ
      ═══════════════════════════════════════════════════════ */
      function calSetMonth(month) {
        state.calendarMonth = month;
        state.calendarSelectedDay = "";
        save();
        render();
      }
      function calSelectDay(day) {
        state.calendarSelectedDay = day;
        save();
        render();
      }
      function calSetAllMode(val) {
        state.calAllMode = !!val;
        render();
      }
      function calSetTypeFilter(type) {
        state.calTypeFilter = type;
        render();
      }

      /* ═══════════════════════════════════════════════════════
         КЛИЕНТСКИЙ ПОРТАЛ (Task 12)
      ═══════════════════════════════════════════════════════ */
      function renderClientPortal() {
        if (!_portalLoaded) {
          return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px">
            <span class="ai-spinner" style="width:32px;height:32px;border-width:3px"></span>
            <p style="color:var(--muted)">Загрузка...</p>
          </div>`;
        }
        if (!_portalData) {
          return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:32px;text-align:center">
            <div style="font-size:64px">🔍</div>
            <h2 style="margin:0;font-size:22px">Ссылка недействительна</h2>
            <p style="color:var(--muted);max-width:360px;line-height:1.6">КП не найдено. Проверьте ссылку или обратитесь к менеджеру.</p>
          </div>`;
        }
        const d = _portalData;
        const isApproved = d.deal_status === 'Согласовано' || !!d.approved_at;
        const servicesList = Array.isArray(d.services_list) ? d.services_list : [];
        return `
          <div class="portal-wrap">
            <div class="portal-inner">
              <div class="portal-header">
                <div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,var(--primary),var(--blue));display:grid;place-items:center;flex-shrink:0">
                  <img src="logo-icon.svg" alt="A" onerror="this.style.display='none'" style="width:30px;height:30px;object-fit:contain">
                </div>
                <div>
                  <div style="font-weight:900;font-size:17px;letter-spacing:-.2px">Adervis</div>
                  <div style="font-size:12px;color:var(--muted)">Коммерческое предложение</div>
                </div>
              </div>

              <div class="portal-card">
                <div class="portal-status-badge ${isApproved ? 'approved' : ''}">
                  ${isApproved ? '✅ Согласовано' : '📋 ' + escapeHtml(d.deal_status || 'На рассмотрении')}
                </div>

                <h1 class="portal-title">${escapeHtml(d.deal_name || 'Коммерческое предложение')}</h1>

                <div class="portal-price-block">
                  <div class="portal-price-label">Итоговая стоимость</div>
                  <div class="portal-price-amount">${money(d.total_price || 0)}</div>
                </div>

                ${servicesList.length ? `
                  <div class="portal-section">
                    <h3>Состав услуг</h3>
                    <ul class="portal-services-list">
                      ${servicesList.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}

                ${d.included_text ? `
                  <div class="portal-section">
                    <h3>Включено в стоимость</h3>
                    <p>${escapeHtml(d.included_text).replace(/\n/g,'<br>')}</p>
                  </div>
                ` : ''}

                ${d.excluded_text ? `
                  <div class="portal-section">
                    <h3>Не входит в стоимость</h3>
                    <p style="color:var(--muted)">${escapeHtml(d.excluded_text).replace(/\n/g,'<br>')}</p>
                  </div>
                ` : ''}

                ${d.proposal_note ? `
                  <div class="portal-section portal-note">
                    <p>${escapeHtml(d.proposal_note).replace(/\n/g,'<br>')}</p>
                  </div>
                ` : ''}

                ${!isApproved ? `
                  <button class="btn primary full" onclick="app.approvePortal()"
                    style="margin-top:24px;padding:15px;font-size:15px;font-weight:800;letter-spacing:-.01em">
                    ✅ Утвердить коммерческое предложение
                  </button>
                  <p style="font-size:12px;color:var(--muted);text-align:center;margin-top:10px;line-height:1.5">
                    Нажимая кнопку, вы подтверждаете согласие<br>с условиями коммерческого предложения
                  </p>
                ` : `
                  <div style="text-align:center;margin-top:24px;padding:22px;background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.3);border-radius:14px">
                    <div style="font-size:36px;margin-bottom:8px">✅</div>
                    <div style="font-weight:800;color:var(--green);font-size:15px">КП утверждено</div>
                    <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5">Мы получили ваше подтверждение и свяжемся с вами в ближайшее время.</div>
                  </div>
                `}
              </div>

              <div style="text-align:center;padding:24px 0 8px;font-size:12px;color:var(--muted)">
                Adervis · Digital Creative Agency ·
                <a href="mailto:adervis.digital@gmail.com" style="color:var(--muted)">adervis.digital@gmail.com</a>
              </div>
            </div>
          </div>
        `;
      }

      async function loadPortalData() {
        const { url, key } = getSupabaseConfig();
        if (!url || !key || !window.supabase) { _portalLoaded = true; render(); return; }
        if (!_supabase) { try { _supabase = window.supabase.createClient(url, key); } catch(e) {} }
        if (!_supabase) { _portalLoaded = true; render(); return; }
        try {
          const { data, error } = await _supabase
            .rpc('get_client_portal', { p_portal_id: _portalId })
            .maybeSingle();
          if (!error) _portalData = data;
        } catch(e) { console.warn('Portal load:', e); }
        _portalLoaded = true;
        render();
      }

      async function approvePortal() {
        if (!_supabase || !_portalId || !_portalData) return;
        const btn = document.querySelector('.portal-wrap .btn.primary');
        if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }
        const { error } = await _supabase
          .rpc('approve_client_portal', { p_portal_id: _portalId });
        if (!error) {
          _portalData.deal_status = 'Согласовано';
          _portalData.approved_at = new Date().toISOString();
          render();
        } else {
          if (btn) { btn.disabled = false; btn.textContent = '✅ Утвердить коммерческое предложение'; }
          alert('Ошибка: ' + error.message);
        }
      }

      async function createClientPortal(projectId) {
        const project = (state.savedProjects || []).find(p => p.id === projectId);
        if (!project) { toast('Проект не найден'); return; }
        if (!_supabase) { toast('Supabase не настроен'); return; }
        const snap = project.snapshot || {};
        const proj = snap.project || {};
        const selectedItems = Object.keys(snap.selected || {})
          .map(id => { const b = BASE_ITEMS.find(x => x.id === id); return b ? b.name : null; })
          .filter(Boolean);
        const { data, error } = await _supabase.from('client_portals').insert({
          agency_id: getAgencyId(),
          deal_name: project.name || '',
          deal_status: project.crmStatus || 'КП отправлено',
          total_price: project.total || 0,
          included_text: proj.includedText || '',
          excluded_text: proj.excludedText || '',
          proposal_note: proj.proposalNote || '',
          services_list: selectedItems
        }).select('id').single();
        if (data && !error) {
          const url = location.origin + location.pathname + '?portal=' + data.id;
          try { await navigator.clipboard.writeText(url); } catch(e) {}

          // Отправить письмо клиенту, если у него указан email
          const client = getClientById(project.clientId);
          let emailSent = false;
          if (client?.email) {
            try {
              const { url: sbUrl } = getSupabaseConfig();
              const r = await fetch(`${sbUrl}/functions/v1/send-portal-email`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${_adminSession.access_token}`,
                },
                body: JSON.stringify({
                  clientEmail: client.email,
                  clientName: client.name || '',
                  dealName: project.name || '',
                  portalUrl: url,
                  totalPrice: project.total || 0,
                  agencyName: state.company?.name || 'Adervis',
                }),
              });
              emailSent = r.ok;
            } catch(e) { /* письмо не обязательно — портал создан успешно */ }
          }

          if (emailSent) {
            toast(`✅ Ссылка скопирована, письмо отправлено на ${client.email}`);
          } else {
            toast('✅ Ссылка скопирована: ' + url);
          }
        } else {
          toast('Ошибка: ' + (error && error.message));
        }
      }

      /* ═══════════════════════════════════════════════════════
         DRAG-AND-DROP КАНБАН (Task 13)
      ═══════════════════════════════════════════════════════ */
      let _dragItemId = null, _dragScope = null;

      function onKanbanDragStart(event, id, scope) {
        _dragItemId = id;
        _dragScope = scope;
        event.dataTransfer.effectAllowed = 'move';
      }

      function onKanbanDrop(event, newStatus, scope) {
        event.preventDefault();
        if (!_dragItemId || _dragScope !== scope) { _dragItemId = null; _dragScope = null; return; }
        if (scope === 'crm') {
          const proj = (state.savedProjects || []).find(p => p.id === _dragItemId);
          if (proj && proj.crmStatus !== newStatus) {
            proj.crmStatus = newStatus;
            save(); saveToCloud(); render();
            toast('Статус сделки: ' + newStatus);
            sendTelegramNotification(`📋 <b>${escapeHtml(proj.name || "Сделка")}</b>\nСтатус: ${escapeHtml(newStatus)}${proj.client ? " · " + escapeHtml(proj.client) : ""}`);
          }
        } else if (scope === 'task') {
          const task = (state.tasks || []).find(t => t.id === _dragItemId);
          if (task && task.status !== newStatus) {
            task.status = newStatus;
            save(); render();
          }
        }
        _dragItemId = null; _dragScope = null;
      }

      /* ═══════════════════════════════════════════════════════
         SWIPE-TO-DELETE (Task 16)
      ═══════════════════════════════════════════════════════ */
      let _sw = { el: null, startX: 0, dx: 0, active: false };

      function initSwipeToDelete() {
        const root = document.getElementById('appContent');
        if (!root || root._swipeInited) return;
        root._swipeInited = true;

        root.addEventListener('touchstart', e => {
          const wrap = e.target.closest('.swipe-wrap');
          if (!wrap) return;
          _sw.el = wrap;
          _sw.startX = e.touches[0].clientX;
          _sw.dx = 0; _sw.active = true;
        }, { passive: true });

        root.addEventListener('touchmove', e => {
          if (!_sw.active || !_sw.el) return;
          const dx = e.touches[0].clientX - _sw.startX;
          if (dx < 0) {
            _sw.dx = dx;
            const card = _sw.el.querySelector('.task-card');
            if (card) card.style.transform = `translateX(${Math.max(dx, -120)}px)`;
          }
        }, { passive: true });

        root.addEventListener('touchend', () => {
          if (!_sw.active || !_sw.el) return;
          const wrap = _sw.el;
          const dx = _sw.dx;
          _sw.active = false; _sw.el = null; _sw.dx = 0;
          const card = wrap.querySelector('.task-card');
          if (!card) return;
          if (dx < -80) {
            card.style.transition = 'transform .22s ease, opacity .18s ease';
            card.style.transform = 'translateX(-110%)';
            card.style.opacity = '0';
            setTimeout(() => {
              const taskId = wrap.dataset.taskId;
              if (taskId && confirm('Удалить задачу?')) {
                state.tasks = state.tasks.filter(t => t.id !== taskId);
                save(); render();
              } else {
                card.style.transition = 'transform .2s ease';
                card.style.transform = '';
                card.style.opacity = '';
                setTimeout(() => { card.style.transition = ''; }, 200);
              }
            }, 220);
          } else {
            card.style.transition = 'transform .2s ease';
            card.style.transform = '';
            setTimeout(() => { card.style.transition = ''; }, 200);
          }
        }, { passive: true });
      }

      /* ═══════════════════════════════════════════════════════
         AI-ПОМОЩНИК КП (Task 15)
      ═══════════════════════════════════════════════════════ */
      const AI_PROPOSAL_TRIAL_LIMIT = 5;

      async function generateProposalAI() {
        if (!_adminSession) { toast('Войдите в аккаунт, чтобы сгенерировать КП с ИИ'); return; }

        if (_userProfile && _userProfile.subscription_status === 'trial' && (state.aiProposalCount || 0) >= AI_PROPOSAL_TRIAL_LIMIT) {
          toast(`✨ На пробном тарифе доступно ${AI_PROPOSAL_TRIAL_LIMIT} генераций КП с ИИ — лимит исчерпан. Перейдите на платный тариф для безлимитной генерации.`);
          go('profile');
          return;
        }

        const btn = document.getElementById('aiProposalBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ai-spinner"></span> Генерация...'; }

        const clientName = state.project.client || 'Заказчик';
        const total = totals().total;
        const items = selectedIds()
          .map(id => BASE_ITEMS.find(i => i.id === id))
          .filter(Boolean);
        const serviceNames = [...new Set(items.map(i => i.name))].slice(0, 8);
        const stages = [...new Set(items.map(i => i.stage))].filter(Boolean);

        try {
          const { url } = getSupabaseConfig();
          const resp = await fetch(`${url}/functions/v1/ai-proposal`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${_adminSession.access_token}`,
            },
            body: JSON.stringify({ clientName, total, services: serviceNames, stages }),
          });

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Ошибка сети' }));
            throw new Error(err.error || 'Ошибка генерации КП');
          }

          const { includedText, excludedText, proposalNote } = await resp.json();
          state.project.includedText = includedText;
          state.project.excludedText = excludedText;
          state.project.proposalNote = proposalNote;
          if (_userProfile && _userProfile.subscription_status === 'trial') {
            state.aiProposalCount = (state.aiProposalCount || 0) + 1;
          }

          save(); render();
          toast('✨ КП сгенерировано!');
        } catch (e) {
          toast('Ошибка генерации КП: ' + e.message);
        } finally {
          if (btn) { btn.disabled = false; btn.innerHTML = '✨ Сгенерировать с ИИ'; }
        }
      }

      /* ═══════════════════════════════════════════════════════
         ГЛАВНОЕ МЕНЮ (клик по логотипу, бургер, «Ещё» в нижней навигации)
      ═══════════════════════════════════════════════════════ */
      async function sendTelegramNotification(text) {
        const recipients = state.telegramChatIds || [];
        if (!recipients.length || !_adminSession) return;
        const { url } = getSupabaseConfig();
        for (const r of recipients) {
          if (!r.chatId) continue;
          try {
            await fetch(`${url}/functions/v1/telegram-notify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${_adminSession.access_token}`,
              },
              body: JSON.stringify({ chatId: r.chatId, text }),
            });
          } catch(e) { /* уведомление не критично */ }
        }
      }

      function addTelegramRecipient() {
        state.telegramChatIds = state.telegramChatIds || [];
        state.telegramChatIds.push({ id: uid('tg'), name: '', chatId: '' });
        save(); saveToCloud(); render();
      }

      function removeTelegramRecipient(id) {
        state.telegramChatIds = (state.telegramChatIds || []).filter(r => r.id !== id);
        save(); saveToCloud(); render();
      }

      function setTelegramRecipientField(id, key, val) {
        const r = (state.telegramChatIds || []).find(x => x.id === id);
        if (r) { r[key] = val.trim(); save(); saveToCloud(); }
      }

      async function testTelegramRecipient(id) {
        const r = (state.telegramChatIds || []).find(x => x.id === id);
        if (!r?.chatId) { toast('Введите Chat ID'); return; }
        if (!_adminSession) { toast('Нужна авторизация'); return; }
        const { url } = getSupabaseConfig();
        try {
          const resp = await fetch(`${url}/functions/v1/telegram-notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_adminSession.access_token}` },
            body: JSON.stringify({ chatId: r.chatId, text: `✅ Adervis CRM подключён${r.name ? ', ' + r.name : ''}!\nУведомления о задачах и сделках будут приходить сюда.` }),
          });
          toast(resp.ok ? `Сообщение отправлено${r.name ? ' ' + r.name : ''}` : 'Ошибка отправки — проверьте Chat ID');
        } catch(e) { toast('Ошибка сети'); }
      }

      function openMainMenu() {
        state.mainMenuOpen = true;
        renderModal();
      }
      function closeMainMenu() {
        state.mainMenuOpen = false;
        renderModal();
      }
      function renderMainMenuModal() {
        return `
          <div class="modal-overlay" onclick="event.target===this&&app.closeMainMenu()">
            <div class="modal-box" style="width:min(640px,calc(100vw - 32px))">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div>
                  <h2 style="margin:0;font-size:22px">ADERVIS CRM</h2>
                  <p style="margin:2px 0 0;font-size:13px;color:var(--muted)">Что хочешь сделать?</p>
                </div>
                <button onclick="app.closeMainMenu()" style="background:none;border:none;font-size:24px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</button>
              </div>
              <div class="main-menu-modal">
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('home')">
                  <span class="mm-icon">📋</span>
                  <div class="mm-label">Сделки</div>
                  <div class="mm-sub">Воронка проектов</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.startWizard()">
                  <span class="mm-icon">✨</span>
                  <div class="mm-label">Новая сделка</div>
                  <div class="mm-sub">Быстрый старт</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('deal')">
                  <span class="mm-icon">🧮</span>
                  <div class="mm-label">Смета</div>
                  <div class="mm-sub">Текущий расчёт</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('packages')">
                  <span class="mm-icon">📦</span>
                  <div class="mm-label">Пакеты</div>
                  <div class="mm-sub">Готовые наборы</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('catalog')">
                  <span class="mm-icon">🗂</span>
                  <div class="mm-label">Каталог</div>
                  <div class="mm-sub">Услуги и цены</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('global-finances')">
                  <span class="mm-icon">💰</span>
                  <div class="mm-label">Финансы</div>
                  <div class="mm-sub">Все транзакции</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('global-calendar')">
                  <span class="mm-icon">📅</span>
                  <div class="mm-label">Календарь</div>
                  <div class="mm-sub">Дедлайны и задачи</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('contracts')">
                  <span class="mm-icon">📄</span>
                  <div class="mm-label">Договора</div>
                  <div class="mm-sub">Шаблоны и база</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('clients')">
                  <span class="mm-icon">👥</span>
                  <div class="mm-label">Клиенты</div>
                  <div class="mm-sub">База клиентов</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('briefs')">
                  <span class="mm-icon">📝</span>
                  <div class="mm-label">Онлайн-брифы</div>
                  <div class="mm-sub">Заявки от клиентов</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('knowledge')">
                  <span class="mm-icon">📚</span>
                  <div class="mm-label">База знаний</div>
                  <div class="mm-sub">Скрипты и шаблоны</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('settings')">
                  <span class="mm-icon">⚙️</span>
                  <div class="mm-label">Настройки</div>
                  <div class="mm-sub">Компания, данные</div>
                </button>
                <button class="main-menu-item" onclick="app.toggleTheme()">
                  <span class="mm-icon">&#9681;</span>
                  <div class="mm-label">Тема</div>
                  <div class="mm-sub">Светлая / тёмная</div>
                </button>
                <button class="main-menu-item" onclick="app.closeMainMenu();app.go('profile')">
                  <span class="mm-icon">👤</span>
                  <div class="mm-label">Профиль</div>
                  <div class="mm-sub">Аккаунт, подписка</div>
                </button>
              </div>
            </div>
          </div>
        `;
      }

      /* ═══════════════════════════════════════════════════════
         РЕДАКТИРОВАНИЕ ТРАНЗАКЦИИ
      ═══════════════════════════════════════════════════════ */
      function openEditTransaction(id, type, projectId) {
        let tx = null;
        if (projectId === state.activeProjectId) {
          tx = (type === "income" ? state.payments : state.expenses).find(t => t.id === id);
        } else {
          const proj = state.savedProjects.find(p => p.id === projectId);
          if (proj && proj.snapshot) {
            const arr = type === "income" ? proj.snapshot.payments : proj.snapshot.expenses;
            tx = (arr || []).find(t => t.id === id);
          }
        }
        if (!tx) { toast("Транзакция не найдена"); return; }
        state.editTransactionModal = { ...tx, _type: type, projectId, editId: id };
        renderModal();
      }
      function closeEditTransactionModal() {
        state.editTransactionModal = null;
        renderModal();
      }
      function saveEditTransaction() {
        const m = state.editTransactionModal;
        if (!m) return;
        const amount = numberValue(m.amount, 0);
        if (amount <= 0) { toast("Введи сумму больше нуля"); return; }

        function updateArr(arr) {
          const idx = arr.findIndex(t => t.id === m.editId);
          if (idx >= 0) arr[idx] = { ...arr[idx], title: m.title, amount, date: m.date, method: m.method || "", category: m.category || "", note: m.note || "" };
        }

        if (m.projectId === state.activeProjectId) {
          if (m._type === "income") updateArr(state.payments);
          else updateArr(state.expenses);
        } else {
          const proj = state.savedProjects.find(p => p.id === m.projectId);
          if (proj && proj.snapshot) {
            if (m._type === "income") { updateArr(proj.snapshot.payments || []); proj.paid = (proj.snapshot.payments || []).reduce((s, p) => s + numberValue(p.amount, 0), 0); }
            else { updateArr(proj.snapshot.expenses || []); proj.expensesTotal = (proj.snapshot.expenses || []).reduce((s, e) => s + numberValue(e.amount, 0), 0); }
          }
        }
        toast("Транзакция обновлена");
        state.editTransactionModal = null;
        save();
        render();
      }
      function deleteEditTransaction() {
        const m = state.editTransactionModal;
        if (!m) return;
        if (!confirm("Удалить транзакцию?")) return;
        if (m.projectId === state.activeProjectId) {
          if (m._type === "income") state.payments = state.payments.filter(t => t.id !== m.editId);
          else state.expenses = state.expenses.filter(t => t.id !== m.editId);
        } else {
          const proj = state.savedProjects.find(p => p.id === m.projectId);
          if (proj && proj.snapshot) {
            if (m._type === "income") { proj.snapshot.payments = (proj.snapshot.payments || []).filter(t => t.id !== m.editId); proj.paid = (proj.snapshot.payments || []).reduce((s, p) => s + numberValue(p.amount, 0), 0); }
            else { proj.snapshot.expenses = (proj.snapshot.expenses || []).filter(t => t.id !== m.editId); proj.expensesTotal = (proj.snapshot.expenses || []).reduce((s, e) => s + numberValue(e.amount, 0), 0); }
          }
        }
        toast("Транзакция удалена");
        state.editTransactionModal = null;
        save();
        render();
      }
      function setEditTransactionField(key, value) {
        if (!state.editTransactionModal) return;
        state.editTransactionModal[key] = value;
        renderModal();
      }
      function renderEditTransactionModal() {
        const m = state.editTransactionModal;
        if (!m) return "";
        const isIncome = m._type === "income";
        const amount = numberValue(m.amount, 0);
        return `
          <div class="modal-overlay" onclick="event.target===this&&app.closeEditTransactionModal()">
            <div class="modal-box">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
                <h2 style="margin:0;font-size:20px">Редактировать ${isIncome ? "поступление" : "расход"}</h2>
                <button onclick="app.closeEditTransactionModal()" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</button>
              </div>
              <div class="field" style="margin-bottom:14px">
                <label style="font-size:11px;color:var(--muted);font-weight:850;letter-spacing:.04em">СУММА, ₽ *</label>
                <input class="modal-amount-input" type="number" min="0" value="${escapeHtml(String(m.amount))}" oninput="app.setEditTransactionField('amount',this.value)">
              </div>
              <div class="grid two" style="margin-bottom:14px">
                <div class="field">
                  <label>Описание</label>
                  <input value="${escapeHtml(m.title || "")}" oninput="app.setEditTransactionField('title',this.value)">
                </div>
                <div class="field">
                  <label>Дата</label>
                  <input type="date" value="${escapeHtml(m.date || "")}" onchange="app.setEditTransactionField('date',this.value)">
                </div>
              </div>
              <div class="field" style="margin-bottom:14px">
                <label>${isIncome ? "Статья" : "Категория"}</label>
                <select onchange="app.setEditTransactionField('category',this.value)">
                  ${isIncome
                    ? PAYMENT_ARTICLES.map(c => `<option value="${c}" ${m.category === c ? "selected" : ""}>${c}</option>`).join("")
                    : EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${m.category === c ? "selected" : ""}>${c}</option>`).join("")
                  }
                </select>
              </div>
              <div class="field" style="margin-bottom:22px">
                <label>Комментарий</label>
                <textarea style="min-height:64px" oninput="app.setEditTransactionField('note',this.value)" placeholder="Необязательно">${escapeHtml(m.note || "")}</textarea>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                <button class="btn danger small" onclick="app.deleteEditTransaction()">Удалить</button>
                <div style="display:flex;gap:8px">
                  <button class="btn" onclick="app.closeEditTransactionModal()">Отмена</button>
                  <button class="modal-save-btn ${isIncome ? "income" : "expense"}" onclick="app.saveEditTransaction()">Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      /* ═══════════════════════════════════════════════════════
         КЛИЕНТ MODAL
      ═══════════════════════════════════════════════════════ */
      function openClientModal(clientId) {
        if (!clientId) {
          state.clientModal = { id: "", name: "", company: "", phone: "", email: "", city: "", status: "new", note: "" };
          renderModal();
          return;
        }
        const client = (state.clients || []).find(c => c.id === clientId);
        if (!client) return;
        state.clientModal = { ...client };
        renderModal();
      }
      function closeClientModal() {
        state.clientModal = null;
        renderModal();
      }
      function setClientModalField(key, value) {
        if (!state.clientModal) return;
        state.clientModal[key] = value;
      }
      function saveClientModal() {
        const m = state.clientModal;
        if (!m) return;
        if (m.phone && !validatePhone(m.phone)) {
          toast("❌ Неверный формат телефона. Пример: +7 900 000-00-00");
          return;
        }
        if (!m.id) {
          const created = normalizeClient({ ...m, name: String(m.name || "").trim() || "Новый клиент" });
          state.clients = [created, ...(state.clients || [])];
          state.clientModal = null;
          toast("Клиент добавлен");
          save();
          render();
          return;
        }
        const idx = (state.clients || []).findIndex(c => c.id === m.id);
        if (idx >= 0) {
          state.clients[idx] = normalizeClient({ ...state.clients[idx], ...m, updatedAt: new Date().toISOString() });
          // Синхронизируем имя клиента во всех сделках
          (state.savedProjects || []).forEach(p => {
            if (p.clientId === m.id) p.client = m.name || p.client;
          });
        }
        // Сохраняем дедлайн проекта если открыто из карточки сделки
        if (m._projectId) {
          const proj = (state.savedProjects || []).find(p => p.id === m._projectId);
          if (proj) {
            proj.deadline = m._projectDeadline || "";
            if (proj.snapshot && proj.snapshot.project) proj.snapshot.project.deadline = proj.deadline;
          }
        }
        state.clientModal = null;
        toast("Сохранено");
        save();
        render();
      }
      function renderClientModalHtml() {
        const m = state.clientModal;
        if (!m) return "";
        return `
          <div class="modal-overlay" onclick="event.target===this&&app.closeClientModal()">
            <div class="modal-box" style="width:min(560px,calc(100vw - 32px))">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
                <h2 style="margin:0;font-size:20px">${m.id ? "Редактировать клиента" : "Новый клиент"}</h2>
                <button onclick="app.closeClientModal()" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</button>
              </div>
              <div class="grid two" style="margin-bottom:12px">
                ${field("Имя / название *", `<input value="${escapeHtml(m.name || "")}" oninput="app.setClientModalField('name',this.value)" placeholder="Имя клиента">`)}
                ${field("Компания", `<input value="${escapeHtml(m.company || "")}" oninput="app.setClientModalField('company',this.value)">`)}
                ${field("Телефон", `<input value="${escapeHtml(m.phone || "")}" oninput="app.setClientModalField('phone',this.value)" placeholder="+7...">`)}
                ${field("Email", `<input value="${escapeHtml(m.email || "")}" oninput="app.setClientModalField('email',this.value)" placeholder="mail@...">`)}
                ${field("Город", `<input value="${escapeHtml(m.city || "")}" oninput="app.setClientModalField('city',this.value)">`)}
                ${field("Статус", `<select onchange="app.setClientModalField('status',this.value)">
                  ${["new","active","vip","paused","lost"].map(s => `<option value="${s}" ${m.status === s ? "selected" : ""}>${{new:"Новый",active:"Активный",vip:"VIP",paused:"Пауза",lost:"Потерян"}[s]}</option>`).join("")}
                </select>`)}
              </div>
              ${m._projectId ? `
              <div style="background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.2);border-radius:12px;padding:14px 16px;margin-bottom:14px">
                <div style="font-size:12px;font-weight:800;color:var(--primary2);margin-bottom:10px">📅 Дедлайн проекта</div>
                <input type="date" value="${escapeHtml(m._projectDeadline||"")}"
                  oninput="app.setClientModalField('_projectDeadline',this.value)"
                  style="width:100%;border-radius:10px;border:1px solid var(--line);background:var(--input);color:var(--text);padding:10px 12px;font-size:14px">
              </div>` : ""}
              <div class="field" style="margin-bottom:14px">
                ${field("Заметка", `<textarea style="min-height:72px" oninput="app.setClientModalField('note',this.value)" placeholder="Предпочтения, условия...">${escapeHtml(m.note || "")}</textarea>`)}
              </div>
              <div style="display:flex;justify-content:${m.id ? "space-between" : "flex-end"};align-items:center;gap:10px">
                ${m.id ? `<button class="btn small" onclick="app.closeClientModal();app.openClientDetail('${m.id}')">Все проекты клиента →</button>` : ""}
                <div style="display:flex;gap:8px">
                  <button class="btn" onclick="app.closeClientModal()">Отмена</button>
                  <button class="btn primary" onclick="app.saveClientModal()">${m.id ? "Сохранить" : "Добавить"}</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      /* ═══════════════════════════════════════════════════════
         СДЕЛКА MODAL (редактировать сделку из карточки)
      ═══════════════════════════════════════════════════════ */
      function toggleDealSwitcher(e) {
        e && e.stopPropagation();
        state.dealSwitcherOpen = !state.dealSwitcherOpen;
        renderDealBar();
      }
      function closeDealSwitcher() {
        if (!state.dealSwitcherOpen) return;
        state.dealSwitcherOpen = false;
        renderDealBar();
      }
      function switchDeal(projectId) {
        state.dealSwitcherOpen = false;
        openDeal(projectId);
      }
      function renderDealBar() {
        const el = document.getElementById("dealBarSwitcher");
        if (!el) return;
        el.innerHTML = renderDealSwitcherHtml();
      }
      function renderDealSwitcherHtml() {
        const projects = (state.savedProjects || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        const cur = state.activeProjectId;
        const curProj = projects.find(p => p.id === cur);
        return `
          <div class="deal-switcher">
            <button class="deal-switcher-btn" onclick="app.toggleDealSwitcher(event)" title="Переключить сделку">
              <span class="deal-switcher-btn-label">${escapeHtml((curProj && curProj.name) || state.project.name || "Без названия")}</span>
              <span class="deal-switcher-chevron ${state.dealSwitcherOpen ? "open" : ""}">▼</span>
            </button>
            ${state.dealSwitcherOpen ? `
              <div class="deal-switcher-dropdown">
                ${projects.map((p, i) => {
                  const isActive = p.id === cur;
                  const clientObj = p.clientId ? (state.clients || []).find(c => c.id === p.clientId) : null;
                  const u = p.deadline ? deadlineUrgency(p.deadline) : null;
                  return `
                    <div class="deal-switcher-item ${isActive ? "active" : ""}" onclick="app.switchDeal('${p.id.replace(/'/g, "")}')">
                      <div class="deal-switcher-item-name">${escapeHtml(p.name || "Без названия")}</div>
                      <div class="deal-switcher-item-sub">
                        ${p.client ? `<span>${escapeHtml(p.client)}</span>` : ""}
                        <span class="status-pill" style="font-size:10px;padding:1px 7px">${escapeHtml(p.crmStatus || "Лид")}</span>
                        ${p.deadline ? `<span style="color:${u && u.level !== "ok" ? u.color : "var(--muted)"}">📅 ${escapeHtml(formatDate(p.deadline))}</span>` : ""}
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
              <div onclick="app.closeDealSwitcher()" style="position:fixed;inset:0;z-index:1000;"></div>
            ` : ""}
          </div>
        `;
      }

      function openDealModal(projectId) {
        const project = (state.savedProjects || []).find(p => p.id === projectId);
        if (!project) return;
        state.dealModal = {
          id: project.id,
          name: project.name || "",
          client: project.client || "",
          clientId: project.clientId || "",
          crmStatus: project.crmStatus || "Лид",
          deadline: project.deadline || "",
          manager: project.manager || "",
          note: project.note || ""
        };
        renderModal();
      }
      function closeDealModal() {
        state.dealModal = null;
        renderModal();
      }
      function setDealModalField(key, value) {
        if (!state.dealModal) return;
        state.dealModal[key] = value;
      }
      function saveDealModal() {
        const m = state.dealModal;
        if (!m) return;
        const proj = (state.savedProjects || []).find(p => p.id === m.id);
        if (proj) {
          proj.name = m.name || proj.name;
          proj.crmStatus = m.crmStatus || proj.crmStatus;
          proj.deadline = m.deadline || "";
          proj.manager = m.manager || "";
          proj.note = m.note || "";
          if (proj.snapshot && proj.snapshot.project) {
            proj.snapshot.project.deadline = proj.deadline;
            proj.snapshot.project.crmStatus = proj.crmStatus;
            proj.snapshot.project.name = proj.name;
            proj.snapshot.project.manager = proj.manager;
            proj.snapshot.project.note = proj.note;
          }
          if (proj.id === state.activeProjectId) {
            state.project.name = proj.name;
            state.project.crmStatus = proj.crmStatus;
            state.project.deadline = proj.deadline;
            state.project.manager = proj.manager;
            state.project.note = proj.note;
          }
        }
        state.dealModal = null;
        toast("Сделка сохранена");
        save();
        render();
      }
      function renderDealModalHtml() {
        const m = state.dealModal;
        if (!m) return "";
        const u = m.deadline ? deadlineUrgency(m.deadline) : null;
        return `
          <div class="modal-overlay" onclick="event.target===this&&app.closeDealModal()">
            <div class="modal-box" style="width:min(560px,calc(100vw - 32px))">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:8px">
                <h2 style="margin:0;font-size:20px">Редактировать сделку</h2>
                <div style="display:flex;align-items:center;gap:8px">
                  <button class="btn small" onclick="app.quickContractFromDeal('${escapeHtml(m.id)}')" title="Создать договор с данными этой сделки">📄 Договор</button>
                  <button onclick="app.closeDealModal()" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</button>
                </div>
              </div>
              <div class="grid two" style="margin-bottom:12px">
                ${field("Название сделки *", `<input value="${escapeHtml(m.name || "")}" oninput="app.setDealModalField('name',this.value)" placeholder="Название проекта">`)}
                ${field("Клиент", `<input value="${escapeHtml(m.client || "")}" readonly style="opacity:.65;cursor:not-allowed" title="Клиент изменяется в карточке клиента">`)}
                ${field("Статус воронки", `<select onchange="app.setDealModalField('crmStatus',this.value)">
                  ${CRM_STATUSES.map(s => `<option value="${s}" ${m.crmStatus === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>`)}
                ${field("Менеджер", `<input value="${escapeHtml(m.manager || "")}" oninput="app.setDealModalField('manager',this.value)" placeholder="Имя менеджера">`)}
              </div>
              <div style="background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.2);border-radius:12px;padding:14px 16px;margin-bottom:14px">
                <div style="font-size:12px;font-weight:800;color:var(--primary2);margin-bottom:10px">📅 Дедлайн проекта${u && u.level !== "ok" ? ` <span style="color:${u.color};font-weight:700">· ${escapeHtml(u.label)}</span>` : ""}</div>
                <input type="date" value="${escapeHtml(m.deadline||"")}"
                  oninput="app.setDealModalField('deadline',this.value)"
                  style="width:100%;border-radius:10px;border:1px solid var(--line);background:var(--input);color:var(--text);padding:10px 12px;font-size:14px">
              </div>
              <div class="field" style="margin-bottom:14px">
                ${field("Заметка", `<textarea style="min-height:72px" oninput="app.setDealModalField('note',this.value)" placeholder="Дополнительная информация...">${escapeHtml(m.note || "")}</textarea>`)}
              </div>
              <div style="display:flex;justify-content:flex-end;gap:8px">
                <button class="btn" onclick="app.closeDealModal()">Отмена</button>
                <button class="btn primary" onclick="app.saveDealModal()">Сохранить</button>
              </div>
              <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);text-align:center">
                <button onclick="app.deleteDealFromModal('${escapeHtml(m.id)}')" style="background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;text-decoration:underline;opacity:.6;padding:4px 8px" title="Удалить сделку навсегда">Удалить сделку</button>
              </div>
            </div>
          </div>
        `;
      }

      /* ═══════════════════════════════════════════════════════
         ЗАДАЧА MODAL (открыть задачу из Календаря)
      ═══════════════════════════════════════════════════════ */
      function openTaskModal(taskId) {
        const task = (state.tasks || []).find(t => t.id === taskId);
        if (!task) { toast("Задача не найдена"); return; }
        state.taskModal = { ...task };
        renderModal();
      }
      function closeTaskModal() {
        state.taskModal = null;
        renderModal();
      }
      function setTaskModalField(key, value) {
        if (!state.taskModal) return;
        state.taskModal[key] = value;
        renderModal();
      }
      function saveTaskModal() {
        const m = state.taskModal;
        if (!m) return;
        const idx = (state.tasks || []).findIndex(t => t.id === m.id);
        if (idx >= 0) {
          state.tasks[idx] = normalizeTask({ ...state.tasks[idx], ...m, updatedAt: new Date().toISOString() });
          toast("Задача обновлена");
        }
        state.taskModal = null;
        save();
        render();
      }
      function renderTaskModalHtml() {
        const m = state.taskModal;
        if (!m) return "";
        return `
          <div class="task-modal-overlay" onclick="event.target===this&&app.closeTaskModal()">
            <div class="task-modal-box">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <h2 style="margin:0;font-size:18px">Задача</h2>
                <button onclick="app.closeTaskModal()" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px;line-height:1">×</button>
              </div>
              <div class="field" style="margin-bottom:12px">
                ${field("Название", `<input value="${escapeHtml(m.title || "")}" oninput="app.setTaskModalField('title',this.value)">`)}
              </div>
              <div class="grid two" style="margin-bottom:12px">
                ${field("Статус", `<select onchange="app.setTaskModalField('status',this.value)">
                  ${TASK_STATUSES.map(s => `<option value="${s}" ${m.status===s?"selected":""}>${s}</option>`).join("")}
                </select>`)}
                ${field("Приоритет", `<select onchange="app.setTaskModalField('priority',this.value)">
                  ${PRIORITIES.map(s => `<option value="${s}" ${m.priority===s?"selected":""}>${s}</option>`).join("")}
                </select>`)}
                ${field("Дедлайн", `<input type="date" value="${escapeHtml(m.deadline||"")}" onchange="app.setTaskModalField('deadline',this.value)">`)}
                ${field("Ответственный", `<input value="${escapeHtml(m.assignee||"")}" oninput="app.setTaskModalField('assignee',this.value)" placeholder="Имя...">`)}
              </div>
              <div class="field" style="margin-bottom:18px">
                ${field("Заметка", `<textarea style="min-height:80px" oninput="app.setTaskModalField('note',this.value)" placeholder="Детали задачи...">${escapeHtml(m.note||"")}</textarea>`)}
              </div>
              <div style="display:flex;justify-content:flex-end;gap:8px">
                <button class="btn" onclick="app.closeTaskModal()">Отмена</button>
                <button class="btn primary" onclick="app.saveTaskModal()">Сохранить</button>
              </div>
            </div>
          </div>
        `;
      }

      /* ═══════════════════════════════════════════════════════
         ОТКРЫТЬ СДЕЛКУ НА ВКЛАДКЕ ЗАДАЧИ
      ═══════════════════════════════════════════════════════ */
      function openDealTasks(projectId) {
        const saved = state.savedProjects.find(p => p.id === projectId);
        if (!saved) return;
        loadSavedProject(projectId);
        state.dealView = "tasks";
        save();
        render();
      }

      /* ═══════════════════════════════════════════════════════
         РАЗДЕЛ ДОГОВОРА
      ═══════════════════════════════════════════════════════ */
      const CONTRACT_TEMPLATES = [
        {
          id: "tpl_video",
          name: "Договор на производство видеоконтента",
          desc: "Полный договор с передачей прав, ТЗ и ответственностью",
          category: "Видео",
          body: `ДОГОВОР № _____ НА ОКАЗАНИЕ УСЛУГ ПО СОЗДАНИЮ АУДИОВИЗУАЛЬНОГО ПРОИЗВЕДЕНИЯ

г. _____________, «___» ___________ 202__ г.

Индивидуальный предприниматель / ООО «_______________________________», действующий(-ая) на основании ___________________________, именуемый(-ая) в дальнейшем «Исполнитель», в лице _______________________________________, с одной стороны,
и ___________________________, именуемый(-ая) в дальнейшем «Заказчик», с другой стороны (совместно именуемые «Стороны»), заключили настоящий Договор о нижеследующем:

─────────────────────────────────────────────
СТАТЬЯ 1. ПРЕДМЕТ ДОГОВОРА
─────────────────────────────────────────────
1.1. Исполнитель обязуется по заданию Заказчика оказать услуги по созданию аудиовизуального произведения (далее — «Результат работ») в соответствии с Техническим заданием (Приложение № 1), являющимся неотъемлемой частью настоящего Договора.
1.2. Наименование и формат Результата: ____________________________________________________________.
1.3. Целевое использование: _____________________________________________________________________.

─────────────────────────────────────────────
СТАТЬЯ 2. СТОИМОСТЬ И ПОРЯДОК РАСЧЁТОВ
─────────────────────────────────────────────
2.1. Общая стоимость услуг составляет _____________________________ (___________________) рублей, в т.ч. НДС / без НДС (нужное подчеркнуть).
2.2. Порядок оплаты:
     — Аванс (предоплата) в размере 50% (_______________) рублей — в течение 3 (трёх) банковских дней с момента подписания настоящего Договора;
     — Окончательный расчёт — 50% (_______________) рублей — в течение 3 (трёх) банковских дней с момента подписания Акта приёмки-сдачи оказанных услуг.
2.3. Оплата производится путём перечисления денежных средств на расчётный счёт Исполнителя или иным согласованным Сторонами способом.
2.4. Дополнительные работы, не предусмотренные Техническим заданием, оплачиваются дополнительно по отдельному соглашению.

─────────────────────────────────────────────
СТАТЬЯ 3. СРОКИ ИСПОЛНЕНИЯ
─────────────────────────────────────────────
3.1. Срок выполнения работ: ______ (________________) рабочих дней с даты поступления аванса на расчётный счёт Исполнителя.
3.2. Передача Результата работ Заказчику производится посредством предоставления ссылки на облачное хранилище либо иным согласованным способом.
3.3. В случае задержки предоставления исходных материалов или информации со стороны Заказчика срок выполнения работ соразмерно увеличивается.

─────────────────────────────────────────────
СТАТЬЯ 4. ПРАВА И ОБЯЗАННОСТИ СТОРОН
─────────────────────────────────────────────
4.1. Исполнитель обязуется:
     а) выполнить работы лично или с привлечением третьих лиц в согласованные сроки;
     б) информировать Заказчика о ходе работ по запросу;
     в) передать Результат работ в форматах, указанных в Техническом задании.
4.2. Заказчик обязуется:
     а) своевременно вносить оплату согласно п. 2.2 настоящего Договора;
     б) предоставить все необходимые материалы (логотипы, брифы, доступы, реквизиты) в течение 2 (двух) рабочих дней с даты подписания Договора;
     в) согласовать или мотивированно отклонить Результат в течение 3 (трёх) рабочих дней с момента передачи. По истечении указанного срока Результат считается принятым без замечаний.
4.3. Количество бесплатных кругов правок: 2 (два). Каждый последующий круг правок оплачивается дополнительно в размере ________________ рублей.

─────────────────────────────────────────────
СТАТЬЯ 5. ИНТЕЛЛЕКТУАЛЬНЫЕ ПРАВА
─────────────────────────────────────────────
5.1. Исключительное право на Результат работ переходит к Заказчику с момента полной оплаты по настоящему Договору.
5.2. До момента полной оплаты Исполнитель сохраняет все имущественные права на Результат работ и вправе отозвать переданные материалы.
5.3. Исполнитель сохраняет за собой право использовать Результат работ в портфолио и рекламных целях без получения дополнительного согласия Заказчика, если иное не оговорено в Техническом задании.
5.4. Заказчик гарантирует, что предоставленные им материалы (логотипы, музыка, изображения, тексты) не нарушают права третьих лиц. Ответственность за нарушение авторских прав третьих лиц несёт Заказчик.

─────────────────────────────────────────────
СТАТЬЯ 6. ОТВЕТСТВЕННОСТЬ СТОРОН
─────────────────────────────────────────────
6.1. За нарушение Заказчиком сроков оплаты начисляется пеня в размере 0,1% (ноль целых одна десятая процента) от просроченной суммы за каждый день просрочки, но не более 10% от общей стоимости Договора.
6.2. За нарушение Исполнителем согласованных сроков выполнения работ по вине Исполнителя начисляется пеня в размере 0,05% от стоимости Договора за каждый день просрочки, но не более 5%.
6.3. Стороны освобождаются от ответственности за неисполнение обязательств, если оно явилось следствием обстоятельств непреодолимой силы (форс-мажор), в том числе: стихийных бедствий, военных действий, актов государственных органов. Сторона, ссылающаяся на форс-мажор, обязана уведомить другую Сторону не позднее 3 (трёх) дней с момента наступления таких обстоятельств.

─────────────────────────────────────────────
СТАТЬЯ 7. КОНФИДЕНЦИАЛЬНОСТЬ
─────────────────────────────────────────────
7.1. Стороны обязуются не разглашать конфиденциальную информацию, полученную в рамках исполнения настоящего Договора, без письменного согласия другой Стороны в течение 2 (двух) лет с даты окончания срока действия Договора.

─────────────────────────────────────────────
СТАТЬЯ 8. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ
─────────────────────────────────────────────
8.1. Все споры и разногласия разрешаются путём переговоров. При невозможности урегулирования — в судебном порядке по месту нахождения Исполнителя в соответствии с законодательством Российской Федерации.

─────────────────────────────────────────────
СТАТЬЯ 9. СРОК ДЕЙСТВИЯ И РАСТОРЖЕНИЕ
─────────────────────────────────────────────
9.1. Договор вступает в силу с момента подписания и действует до полного исполнения обязательств Сторонами.
9.2. Договор может быть расторгнут досрочно по соглашению Сторон или в одностороннем порядке с письменным уведомлением за 7 (семь) рабочих дней. При одностороннем расторжении по инициативе Заказчика уплаченный аванс не возвращается; при расторжении по инициативе Исполнителя — возвращается за вычетом стоимости фактически выполненных работ.

─────────────────────────────────────────────
СТАТЬЯ 10. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН
─────────────────────────────────────────────

ИСПОЛНИТЕЛЬ:                                   ЗАКАЗЧИК:
Наименование: ____________________             Наименование: ____________________
ИНН/ОГРНИП: _____________________             ИНН: _____________________________
Р/счёт: __________________________             Р/счёт: __________________________
Банк: ___________________________              Банк: ___________________________
БИК: ____________________________              БИК: ____________________________
Тел.: ___________________________              Тел.: ___________________________
Email: __________________________              Email: __________________________

Подпись: _______________________               Подпись: _______________________
               М.П.                                          М.П.

─────────────────────────────────────────────
ПРИЛОЖЕНИЕ № 1 — ТЕХНИЧЕСКОЕ ЗАДАНИЕ
─────────────────────────────────────────────
Описание проекта: _____________________________________________________________
Формат и хронометраж: _________________________________________________________
Съёмочные дни: _______________________________________________________________
Локации: _____________________________________________________________________
Команда: _____________________________________________________________________
Форматы сдачи: _______________________________________________________________
Особые требования: ____________________________________________________________`
        },
        {
          id: "tpl_photo",
          name: "Договор на фотосъёмку (коммерческая)",
          desc: "Договор с передачей прав, сроками и правками",
          category: "Фото",
          body: `ДОГОВОР № _____ НА ОКАЗАНИЕ УСЛУГ ПО ФОТОСЪЁМКЕ

г. _____________, «___» ___________ 202__ г.

________________________ (Исполнитель) и ________________________ (Заказчик) заключили настоящий Договор:

─────────────────────────────────────────────
1. ПРЕДМЕТ ДОГОВОРА
─────────────────────────────────────────────
1.1. Исполнитель обязуется провести профессиональную фотосъёмку и передать обработанные фотоматериалы:
     — Объект/событие съёмки: _____________________________________________________________
     — Дата съёмки: «___» ___________ 202__ г.
     — Место проведения: __________________________________________________________________
     — Продолжительность: _____ часов
     — Количество передаваемых фотографий: не менее _____ шт.
     — Обработка: ☐ базовая цветокоррекция  ☐ ретушь  ☐ художественная обработка

─────────────────────────────────────────────
2. СТОИМОСТЬ И ОПЛАТА
─────────────────────────────────────────────
2.1. Общая стоимость услуг: ______________________________ (________________) руб.
2.2. Аванс 50% — до начала съёмки, окончательный расчёт — при передаче файлов.
2.3. Дополнительная ретушь сверх согласованного объёма оплачивается отдельно: _______ руб./фото.

─────────────────────────────────────────────
3. СРОКИ
─────────────────────────────────────────────
3.1. Передача обработанных фотоматериалов — в течение _____ рабочих дней с даты съёмки.
3.2. В случае отмены съёмки по инициативе Заказчика менее чем за 24 часа аванс не возвращается.

─────────────────────────────────────────────
4. ПРАВА НА РЕЗУЛЬТАТ
─────────────────────────────────────────────
4.1. Исключительные права на фотоматериалы передаются Заказчику после полной оплаты.
4.2. Целевое использование прав: __________________________________________________________
4.3. Исполнитель вправе использовать до 10 фотографий в портфолио без нанесения вреда коммерческим интересам Заказчика, если Заказчик не заявил письменный запрет.

─────────────────────────────────────────────
5. ОТВЕТСТВЕННОСТЬ
─────────────────────────────────────────────
5.1. Исполнитель не несёт ответственности за результат съёмки при неудовлетворительном освещении, погодных условиях или ненадлежащей подготовке объектов съёмки Заказчиком.
5.2. Исполнитель использует профессиональное оборудование и гарантирует соответствие результата согласованным в ТЗ требованиям.
5.3. При потере исходных файлов по вине Исполнителя ответственность ограничена возвратом полученного аванса.

─────────────────────────────────────────────
6. РЕКВИЗИТЫ И ПОДПИСИ
─────────────────────────────────────────────

ИСПОЛНИТЕЛЬ:                              ЗАКАЗЧИК:
____________________________              ____________________________
ИНН: _______________________             ИНН: _______________________
Тел.: _______________________            Тел.: _______________________
Email: ______________________            Email: ______________________

Подпись: ___________________             Подпись: ___________________`
        },
        {
          id: "tpl_event",
          name: "Договор на съёмку мероприятия",
          desc: "Корпоратив, конференция, свадьба, торжество",
          category: "Мероприятие",
          body: `ДОГОВОР № _____ НА ОКАЗАНИЕ УСЛУГ ПО ВИДЕО- И/ИЛИ ФОТОСЪЁМКЕ МЕРОПРИЯТИЯ

г. _____________, «___» ___________ 202__ г.

________________________ (Исполнитель) и ________________________ (Заказчик) заключили настоящий Договор:

─────────────────────────────────────────────
1. ПРЕДМЕТ ДОГОВОРА
─────────────────────────────────────────────
1.1. Наименование мероприятия: ________________________________________________________________
1.2. Дата проведения: «___» ___________ 202__ г.
1.3. Место проведения: ________________________________________________________________________
1.4. Предполагаемое количество гостей: ________________________________________________________
1.5. Состав услуг: ☐ Видеосъёмка  ☐ Фотосъёмка  ☐ Монтаж ролика  ☐ Обработка фото  ☐ Прямая трансляция
     Подробности: ____________________________________________________________________________
1.6. Продолжительность работы на площадке: _____ часов (с ___:___ до ___:___).

─────────────────────────────────────────────
2. РЕЗУЛЬТАТ И СРОКИ ПЕРЕДАЧИ
─────────────────────────────────────────────
2.1. Итоговый видеоролик хронометражом _____ мин передаётся в течение _____ рабочих дней после мероприятия.
2.2. Фотоматериалы (не менее _____ обработанных снимков) — в течение _____ рабочих дней.
2.3. Формат передачи: облачное хранилище (Яндекс Диск / Google Drive / WeTransfer).

─────────────────────────────────────────────
3. СТОИМОСТЬ И ПОРЯДОК ОПЛАТЫ
─────────────────────────────────────────────
3.1. Стоимость услуг: ______________________________ (_________________) рублей.
3.2. Аванс 50% вносится не позднее чем за 5 (пять) рабочих дней до мероприятия.
3.3. Остаток 50% — в течение 3 (трёх) рабочих дней после передачи готовых материалов.
3.4. Сверхурочная работа сверх согласованного времени тарифицируется дополнительно: _____ руб./час.
3.5. Транспортные расходы за пределами г. ____________: оплачиваются дополнительно по факту.

─────────────────────────────────────────────
4. ОТМЕНА И ПЕРЕНОС
─────────────────────────────────────────────
4.1. При отмене мероприятия Заказчиком:
     — более чем за 14 дней до даты: аванс возвращается за вычетом 20% организационных расходов;
     — от 7 до 14 дней: возвращается 30% аванса;
     — менее чем за 7 дней: аванс не возвращается.
4.2. Перенос мероприятия возможен с уведомлением не менее чем за 7 (семь) дней, при наличии свободного времени у Исполнителя.

─────────────────────────────────────────────
5. ОСОБЫЕ УСЛОВИЯ
─────────────────────────────────────────────
5.1. Заказчик обеспечивает возможность свободного передвижения съёмочной группы по площадке.
5.2. Питание для съёмочной группы на площадке обеспечивается Заказчиком или оплачивается дополнительно.
5.3. Исполнитель вправе принимать самостоятельные художественные решения в рамках согласованного ТЗ.

─────────────────────────────────────────────
6. РЕКВИЗИТЫ И ПОДПИСИ
─────────────────────────────────────────────

ИСПОЛНИТЕЛЬ:                              ЗАКАЗЧИК:
____________________________              ____________________________
ИНН: _______________________             ИНН: _______________________
Тел.: _______________________            Тел.: _______________________

Подпись: ___________________             Подпись: ___________________`
        },
        {
          id: "tpl_retainer",
          name: "Договор — ежемесячный ретейнер (контент)",
          desc: "Регулярное производство видео/фото контента по подписке",
          category: "Подписка",
          body: `ДОГОВОР № _____ НА СОЗДАНИЕ МЕДИАКОНТЕНТА (АБОНЕНТСКОЕ ОБСЛУЖИВАНИЕ)

г. _____________, «___» ___________ 202__ г.

________________________ (Исполнитель) и ________________________ (Заказчик) заключили настоящий Договор:

─────────────────────────────────────────────
1. ПРЕДМЕТ И ОБЪЁМ УСЛУГ
─────────────────────────────────────────────
1.1. Исполнитель обязуется ежемесячно оказывать услуги по созданию медиаконтента в следующем объёме:

Видеоконтент:
     — Короткие ролики (Reels/Shorts) до 60 сек: _____ шт./мес.
     — Длинные ролики (YouTube/ВКонтакте): _____ шт./мес.
     — Монтаж предоставленного материала: _____ шт./мес.

Фотоконтент:
     — Съёмочных сессий: _____ шт./мес.
     — Обработанных фотографий: _____ шт./мес.

1.2. Точный план контента на каждый месяц согласовывается не позднее ___-го числа предыдущего месяца.
1.3. Неиспользованный объём на следующий месяц не переносится.

─────────────────────────────────────────────
2. СТОИМОСТЬ И ПОРЯДОК ОПЛАТЫ
─────────────────────────────────────────────
2.1. Ежемесячное вознаграждение: ______________________________ (_________________) рублей.
2.2. Оплата производится до ___-го числа текущего месяца за текущий месяц (оплата авансом).
2.3. При просрочке оплаты более 5 (пяти) рабочих дней Исполнитель вправе приостановить работы без ответственности за нарушение сроков.

─────────────────────────────────────────────
3. СРОК ДЕЙСТВИЯ И РАСТОРЖЕНИЕ
─────────────────────────────────────────────
3.1. Договор заключается на срок: с «___» ___________ 202__ г. по «___» ___________ 202__ г.
3.2. По истечении срока автоматически пролонгируется на следующий месяц, если ни одна из Сторон не уведомила о расторжении.
3.3. Для расторжения Договора необходимо письменное уведомление за 30 (тридцать) календарных дней. Контент, созданный в оплаченном периоде, передаётся Заказчику в полном объёме.

─────────────────────────────────────────────
4. ПРАВА НА КОНТЕНТ
─────────────────────────────────────────────
4.1. Исключительные права на созданный контент переходят к Заказчику при условии своевременной оплаты за соответствующий период.
4.2. При наличии задолженности Исполнитель вправе ограничить передачу контента до полного погашения долга.

─────────────────────────────────────────────
5. РЕКВИЗИТЫ И ПОДПИСИ
─────────────────────────────────────────────

ИСПОЛНИТЕЛЬ:                              ЗАКАЗЧИК:
____________________________              ____________________________
ИНН: _______________________             ИНН: _______________________
Тел.: _______________________            Тел.: _______________________

Подпись: ___________________             Подпись: ___________________`
        },
        {
          id: "tpl_wedding",
          name: "Договор на свадебную съёмку",
          desc: "Специализированный договор для свадебного продакшна",
          category: "Свадьба",
          body: `ДОГОВОР № _____ НА ОКАЗАНИЕ УСЛУГ ПО СВАДЕБНОЙ ВИДЕО- И ФОТОСЪЁМКЕ

г. _____________, «___» ___________ 202__ г.

________________________ (Исполнитель) и ________________________ (Заказчик) заключили настоящий Договор:

─────────────────────────────────────────────
1. ДАННЫЕ О МЕРОПРИЯТИИ
─────────────────────────────────────────────
1.1. Дата свадьбы: «___» ___________ 202__ г.
1.2. ФИО молодожёнов: ___________________________________________________________________
1.3. Место регистрации/церемонии: _________________________________________________________
1.4. Место проведения торжества: __________________________________________________________
1.5. Приблизительное время начала: __________ Окончание: __________

─────────────────────────────────────────────
2. СОСТАВ УСЛУГ
─────────────────────────────────────────────
2.1. ☐ Видеосъёмка: _____ видеооператор(ов), итоговый материал — ______________________________
2.2. ☐ Фотосъёмка: _____ фотограф(ов), количество обработанных снимков — не менее _____ шт.
2.3. ☐ Аэросъёмка (дрон): _________________________________________________________________
2.4. ☐ Love-story (до свадьбы): ___________________________________________________________
2.5. Форматы передачи результата: ________________________________________________________

─────────────────────────────────────────────
3. СТОИМОСТЬ И ОПЛАТА
─────────────────────────────────────────────
3.1. Общая стоимость услуг: ______________________________ (_________________) рублей.
3.2. Для бронирования даты вносится невозвратный задаток в размере _____ (_________) рублей в течение 3 (трёх) дней с подписания Договора.
3.3. Остаток суммы вносится: ☐ до свадьбы до «___» ___________  ☐ в день свадьбы до начала съёмки.
3.4. Доплата за сверхурочную работу (свыше _____ часов): _____ руб./час.

─────────────────────────────────────────────
4. СРОКИ ПЕРЕДАЧИ МАТЕРИАЛОВ
─────────────────────────────────────────────
4.1. Фотоматериалы — в течение _____ рабочих дней после свадьбы.
4.2. Финальный свадебный фильм — в течение _____ рабочих дней после свадьбы.
4.3. Свадебный клип/тизер — в течение _____ рабочих дней после свадьбы.
4.4. Исходные файлы: ☐ передаются  ☐ не передаются.

─────────────────────────────────────────────
5. ВАЖНЫЕ УСЛОВИЯ
─────────────────────────────────────────────
5.1. Задаток является гарантией бронирования даты. В случае отмены свадьбы по любой причине задаток не возвращается.
5.2. Если торжество затягивается по не зависящим от Исполнителя причинам, сверхурочные оплачиваются дополнительно.
5.3. Исполнитель гарантирует конфиденциальность и не передаёт материалы третьим лицам без согласия Заказчика.
5.4. Публикация в портфолио Исполнителя: ☐ разрешена  ☐ запрещена.
5.5. В день съёмки Заказчик обеспечивает Исполнителя питанием или выплачивает компенсацию _____ руб./чел.

─────────────────────────────────────────────
6. РЕКВИЗИТЫ И ПОДПИСИ
─────────────────────────────────────────────

ИСПОЛНИТЕЛЬ:                              ЗАКАЗЧИК(И):
____________________________              ____________________________
ИНН: _______________________             Паспорт: ____________________
Тел.: _______________________            Тел.: _______________________
Email: ______________________            Email: ______________________

Подпись: ___________________             Подписи: ___________________`
        }
      ];

      function normalizeContract(c) {
        return {
          id: c?.id || uid("contract"),
          name: c?.name || "Новый договор",
          desc: c?.desc || "",
          category: c?.category || "Прочее",
          body: c?.body || "",
          createdAt: c?.createdAt || new Date().toISOString(),
          updatedAt: c?.updatedAt || new Date().toISOString()
        };
      }

      function createContractFromTemplate(tplId) {
        const tpl = CONTRACT_TEMPLATES.find(t => t.id === tplId);
        const base = tpl || CONTRACT_TEMPLATES[0];
        const contract = normalizeContract({
          name: (base.name || "Договор") + " — " + (state.project.client || state.company.name || "Новый"),
          desc: base.desc || "",
          category: base.category || "Прочее",
          body: (base.body || "").replace("[ИСПОЛНИТЕЛЬ]", state.company.name || "Исполнитель").replace("[ЗАКАЗЧИК]", state.project.client || "Заказчик")
        });
        if (!state.contracts) state.contracts = [];
        state.contracts.unshift(contract);
        toast("Договор создан — редактируй текст");
        save();
        render();
      }

      function quickContractFromDeal(projectId) {
        const proj = projectId
          ? (state.savedProjects || []).find(p => p.id === projectId)
          : null;
        const snap = (proj && proj.snapshot) || {};
        const clientName = (proj ? proj.client : state.project.client) || "Заказчик";
        const projectName = (proj ? proj.name : state.project.name) || "Проект";
        const deadline = (proj ? proj.deadline : state.project.deadline) || "";
        const totalPrice = proj
          ? (proj.total ? String(Math.round(Number(proj.total))) : "___")
          : String(Math.round(totals().total || 0));
        const half = Math.round(Number(totalPrice) / 2) || 0;
        const base = CONTRACT_TEMPLATES[0];
        let body = (base.body || "")
          .replace("[ИСПОЛНИТЕЛЬ]", state.company.name || "Исполнитель")
          .replace("[ЗАКАЗЧИК]", clientName)
          .replace(/_____________________________ \(___________________\) рублей/, `${totalPrice} рублей`)
          .replace(/50% \(_______________\) рублей — в течение 3/g, `50% (${half}) рублей — в течение 3`);
        if (deadline) {
          body = body.replace("«___» ___________ 202__ г.", `до ${deadline}`);
        }
        body = body.replace(/1\.2\. Наименование и формат Результата: _{3,}\./, `1.2. Наименование и формат Результата: ${projectName}.`);
        const contract = normalizeContract({
          name: `${base.name} — ${clientName}`,
          desc: projectName,
          category: base.category || "Видео",
          body
        });
        if (!state.contracts) state.contracts = [];
        state.contracts.unshift(contract);
        if (proj) state.dealModal = null;
        state.contractEditId = contract.id;
        toast("Договор создан с данными сделки");
        save();
        go("contracts");
      }

      function createBlankContract() {
        const contract = normalizeContract({
          name: "Новый договор — " + (state.project.client || state.company.name || ""),
          body: "ДОГОВОР\n\nг. _____________, «___» ___________ 202_ г.\n\n[Исполнитель] и [Заказчик]\n\n1. ПРЕДМЕТ ДОГОВОРА\n\n2. СТОИМОСТЬ И ОПЛАТА\n\n3. СРОКИ\n\n4. ПОДПИСИ\n\nИСПОЛНИТЕЛЬ ________________    ЗАКАЗЧИК ________________"
        });
        if (!state.contracts) state.contracts = [];
        state.contracts.unshift(contract);
        save();
        render();
      }

      function updateContractField(id, key, value) {
        const c = (state.contracts || []).find(x => x.id === id);
        if (c) { c[key] = value; c.updatedAt = new Date().toISOString(); }
        save();
      }

      function deleteContract(id) {
        if (!confirm("Удалить договор?")) return;
        state.contracts = (state.contracts || []).filter(c => c.id !== id);
        toast("Договор удалён");
        save();
        render();
      }

      function printContract(id) {
        const c = (state.contracts || []).find(x => x.id === id);
        if (!c) return;
        const win = window.open("", "_blank");
        win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${c.name}</title><style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.6;white-space:pre-wrap;font-size:13px}h1{font-size:18px;margin-bottom:16px}</style></head><body><h1>${c.name}</h1>${c.body}</body></html>`);
        win.document.close();
        win.print();
      }

      function renderContracts() {
        const contracts = state.contracts || [];
        const editId = state.contractEditId || "";

        if (editId) {
          const c = contracts.find(x => x.id === editId);
          if (c) {
            return `
              <div class="panel">
                <div class="section-title" style="margin-bottom:16px">
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <button class="btn small" onclick="app.closeContractEdit()">← Договора</button>
                    <input value="${escapeHtml(c.name)}" onchange="app.updateContractField('${c.id}','name',this.value)"
                      style="font-size:18px;font-weight:900;background:transparent;border:1px solid transparent;border-radius:8px;padding:4px 8px;color:var(--text);flex:1;min-width:0"
                      onmouseover="this.style.borderColor='var(--line)'" onmouseout="this.style.borderColor='transparent'">
                  </div>
                  <div class="toolbar no-print">
                    <button class="btn green" onclick="app.printContract('${c.id}')">Печать / PDF</button>
                    <button class="btn danger" onclick="app.deleteContract('${c.id}');app.closeContractEdit()">Удалить</button>
                  </div>
                </div>
                <div class="field" style="margin-bottom:12px">
                  <div class="grid two">
                    ${field("Категория", `<input value="${escapeHtml(c.category||"")}" onchange="app.updateContractField('${c.id}','category',this.value)" placeholder="Видео, Фото...">`)}
                    ${field("Описание", `<input value="${escapeHtml(c.desc||"")}" onchange="app.updateContractField('${c.id}','desc',this.value)" placeholder="Краткое описание">`)}
                  </div>
                </div>
                <div class="field">
                  <label style="font-size:12px;color:var(--muted);font-weight:750;margin-bottom:6px;display:block">Текст договора (редактируй свободно)</label>
                  <textarea class="contract-editor" onchange="app.updateContractField('${c.id}','body',this.value)">${escapeHtml(c.body||"")}</textarea>
                </div>
                <p class="mini-note" style="margin-top:8px">Изменения сохраняются автоматически при выходе из поля. Нажми «Печать / PDF» для экспорта.</p>
              </div>
            `;
          }
        }

        return `
          <div class="panel">
            <div class="section-title">
              <div>
                <h1>Договора</h1>
                <p>База шаблонов и готовых договоров. Редактируй под каждый проект.</p>
              </div>
              <div class="toolbar no-print">
                <button class="btn primary" onclick="app.createBlankContract()">+ Пустой договор</button>
              </div>
            </div>

            <h2 style="font-size:16px;margin:0 0 12px;color:var(--muted)">Шаблоны</h2>
            <div class="grid four" style="margin-bottom:24px">
              ${CONTRACT_TEMPLATES.map(tpl => `
                <div style="padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--panel2);cursor:pointer;transition:.15s"
                     onclick="app.createContractFromTemplate('${tpl.id}')"
                     onmouseover="this.style.borderColor='rgba(168,85,247,.5)'"
                     onmouseout="this.style.borderColor='var(--line)'">
                  <div style="font-size:20px;margin-bottom:8px">📄</div>
                  <h3 style="font-size:13px;margin:0 0 4px">${escapeHtml(tpl.name)}</h3>
                  <p style="font-size:11px;margin:0">${escapeHtml(tpl.desc)}</p>
                  <span class="badge" style="margin-top:8px;display:inline-flex">${escapeHtml(tpl.category)}</span>
                </div>
              `).join("")}
            </div>

            ${contracts.length ? `
              <h2 style="font-size:16px;margin:0 0 12px">Мои договора (${contracts.length})</h2>
              <div class="grid three">
                ${contracts.map(c => `
                  <article class="contract-card" onclick="app.openContractEdit('${c.id}')">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
                      <h3 style="margin:0;font-size:15px">${escapeHtml(c.name)}</h3>
                      <span class="badge">${escapeHtml(c.category||"Прочее")}</span>
                    </div>
                    ${c.desc ? `<p style="font-size:12px;margin:0 0 8px">${escapeHtml(c.desc)}</p>` : ""}
                    <p style="font-size:11px;margin:0;color:var(--muted)">Обновлён: ${formatDate(c.updatedAt)}</p>
                    <div class="toolbar no-print" style="margin-top:10px">
                      <button class="btn primary small" onclick="event.stopPropagation();app.openContractEdit('${c.id}')">✏ Редактировать</button>
                      <button class="btn small" onclick="event.stopPropagation();app.printContract('${c.id}')">Печать</button>
                      <button class="btn danger small" onclick="event.stopPropagation();app.deleteContract('${c.id}')">×</button>
                    </div>
                  </article>
                `).join("")}
              </div>
            ` : `<div class="empty">Договоров пока нет — выбери шаблон выше или создай пустой.</div>`}
          </div>
        `;
      }

      function openContractEdit(id) {
        state.contractEditId = id;
        save();
        render();
      }

      function closeContractEdit() {
        state.contractEditId = "";
        save();
        render();
      }

      function initEvents() {
        document.querySelectorAll(".nav button").forEach(button => {
          button.addEventListener("click", () => {
            const view = button.dataset.view;
            if (view === "wizard") { startWizard(); return; }
            if (view === "deal") {
              state.dealView = "estimate";
              go("deal");
              return;
            }
            if (view === "clients") { state.clientDetailId = ""; }
            go(view);
          });
        });

        const globalAddBtn = document.getElementById("globalAddBtn");
        if (globalAddBtn) {
          globalAddBtn.addEventListener("click", e => { e.stopPropagation(); toggleGlobalMenu(); });
        }
        document.addEventListener("click", () => closeGlobalMenu());

        const scrollTopBtn = document.getElementById("scrollTopBtn");
        if (scrollTopBtn) {
          scrollTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
          window.addEventListener("scroll", () => {
            scrollTopBtn.classList.toggle("visible", window.scrollY > 250);
          }, { passive: true });
        }

        document.addEventListener("keydown", e => {
          if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            const active = document.activeElement;
            if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
            e.preventDefault();
            undo();
          }
          if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
            const active = document.activeElement;
            if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
            e.preventDefault();
            redo();
          }
          if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            openSearch();
          }
          if (e.key === "Escape") {
            closeSearch();
            toggleProfileDd(false);
            toggleHelpDd(false);
          }
        });

        const themeBtn = document.getElementById("themeBtn");
        if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

        // Смета hover-тултип с именем активного проекта
        const _estimateBtn = document.getElementById("navEstimateBtn");
        const _estimateTip = document.getElementById("estimateNavTooltip");
        if (_estimateBtn && _estimateTip) {
          _estimateBtn.addEventListener("mouseenter", () => {
            const name = _estimateTip.dataset.project;
            if (!name) return;
            _estimateTip.textContent = name;
            const r = _estimateBtn.getBoundingClientRect();
            _estimateTip.style.left = Math.round(r.left) + "px";
            _estimateTip.style.top = Math.round(r.bottom + 8) + "px";
            _estimateTip.classList.add("visible");
          });
          _estimateBtn.addEventListener("mouseleave", () => {
            _estimateTip.classList.remove("visible");
          });
        }

        const clientModeBtn = document.getElementById("clientModeBtn");
        if (clientModeBtn) clientModeBtn.addEventListener("click", toggleClientMode);

        const burgerBtn = document.getElementById("burgerBtn");
        if (burgerBtn) burgerBtn.addEventListener("click", openMainMenu);

        const helpBtn = document.getElementById("helpBtn");
        if (helpBtn) helpBtn.addEventListener("click", openHelpModal);

        const importJsonInput = document.getElementById("importJsonInput");
        if (importJsonInput) importJsonInput.addEventListener("change", importData);

        const importCatalogInput = document.getElementById("importCatalogInput");
        if (importCatalogInput) importCatalogInput.addEventListener("change", importCatalog);
      }

      function initTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);

        if (savedTheme === "light" || savedTheme === "dark") {
          setTheme(savedTheme);
          return;
        }

        const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
        setTheme(prefersLight ? "light" : "dark");
      }

      window.app = {
        go,
        setTab,
        setSearch,
        setFilter,
        setSort,
        setProjectFilter,
        setProjectSort,

        toggleTheme,
        toggleClientMode,

        addItem,
        removeItem,
        duplicateEstimateLine,
        duplicateToCustom,
        hideCatalogItem,
        restoreCatalogItem,
        toggleFavorite,
        toggleOptional,
        toggleLineCollapse,
        toggleStageCollapse,
        collapseAllEstimate,
        expandAllEstimate,
        toggleAllEstimate,
        toggleSummary,

        updateLine,
        updateCatalogPrice,
        resetCatalogPrice,

        updateProject,
        updateCompany,

        createVersion,
        restoreVersion,
        deleteVersion,

        clearEstimate,
        resetAllData,

        createCustomItem,
        updateCustomItem,
        deleteCustomItem,

        applyPackage,
        createPackage,
        deletePackage,

        createClient,
        editClient,
        updateClientDraft,
        saveClientDraft,
        checkPhoneField,
        cancelClientDraft,
        selectClient,
        deleteClient,
        createClientFromProject,

        saveCurrentProject,
        loadSavedProject,
        duplicateSavedProject,
        deleteSavedProject,
        deleteDealFromModal,
        newProject,

        createTask,
        updateTask,
        deleteTask,

        createPayment,
        updatePayment,
        deletePayment,

        createExpense,
        updateExpense,
        deleteExpense,

        createTeamMember,
        updateTeamMember,
        deleteTeamMember,

        exportData,
        importData,
        exportCatalog,
        importCatalog,
        exportXlsx,
        copyProposalText,
        printProposal,
        downloadProposalPDF,
        importCompanyLogo,

        dragStart,
        dragOver,
        dropOn,

        undo,
        redo,
        permanentlyDeleteItem,
        openClientEstimate,
        openClientDetail,
        closeClientDetail,
        setGFinFilter,
        setGFinTypeFilter,
        setGFinSubTab,
        setGFinDatePreset,
        setGFinDateFrom,
        setGFinDateTo,
        duplicateDeal,
        updateClientField,
        startWizardForClient,

        setDealView,
        setCrmFilter,
        toggleGlobalMenu,
        closeGlobalMenu,
        openFinanceModal,
        closeFinanceModal,
        setFinanceModalType,
        setFinanceModalField,
        saveFinanceModal,
        startWizard,
        wizardSetData,
        wizardSetField,
        wizardNext,
        wizardBack,
        cancelWizard,
        finishWizard,
        finishWizardWithPackage,
        advanceCrmStatus,
        openDeal,

        calSetMonth,
        calSelectDay,
        calSetAllMode,
        calSetTypeFilter,

        onKanbanDragStart,
        onKanbanDrop,

        generateProposalAI,

        approvePortal,
        createClientPortal,

        oauthSignIn,

        openMainMenu,
        closeMainMenu,

        openEditTransaction,
        closeEditTransactionModal,
        saveEditTransaction,
        deleteEditTransaction,
        setEditTransactionField,

        openClientModal,
        closeClientModal,
        setClientModalField,
        saveClientModal,

        toggleDealSwitcher,
        closeDealSwitcher,
        switchDeal,

        openDealModal,
        closeDealModal,
        setDealModalField,
        saveDealModal,

        openTaskModal,
        closeTaskModal,
        setTaskModalField,
        saveTaskModal,

        openDealTasks,

        renderContracts,
        createContractFromTemplate,
        quickContractFromDeal,
        createBlankContract,
        updateContractField,
        deleteContract,
        printContract,
        openContractEdit,
        closeContractEdit,

        openAdminModal,
        closeAdminModal,
        setAdminField,
        adminLogin,
        adminLogout,
        saveSupabaseConfig,

        setAuthTab,
        setAuthField,
        toggleAuthPasswordVisibility,
        authSubmit,
        forgotPasswordSubmit,
        useLocalMode,

        toggleNotifPopup,
        clearNotifs,
        notifClick,

        renderProfile,
        renderPlans,
        renderSupport,
        forceSaveToCloud,
        openChangePassword,
        submitChangePassword,
        confirmDeleteAccount,

        openHelpModal,
        closeHelpModal,
        helpNext,
        helpPrev,
        setHelpSlide,

        renderKnowledge,
        kbOpen,
        kbBack,
        kbSetSearch,
        kbSetCat,
        kbNew,
        kbSave,
        kbDuplicate,
        kbDelete,

        updateBriefField,
        submitBrief,
        copyBriefLink,
        convertBriefToDeal,
        deleteBrief,

        buyPlan,
        validatePromo,
        clearPromo,
        _promoInput: (v) => { _promoCode = v; },
        gotoSubscription,

        _toast: toast,
        getAgencyId,
        exitLocalModeAndLogin,
        toggleProfileDd,
        toggleHelpDd,
        toggleCurrencyDd,
        selectCurrency,
        updateProjectDeadlineCard,
        uploadUserAvatar,
        removeUserAvatar,
        _saveUserField,
        openSearch,
        closeSearch,
        runSearch,
        setPkgCatFilter: (cat) => { state.pkgCatFilter = cat; render(); },

        addTelegramRecipient,
        removeTelegramRecipient,
        setTelegramRecipientField,
        testTelegramRecipient,
      };

      function checkDeadlineNotifications() {
        const today = todayIso();
        const notifKey = "adervis_deadline_notif_" + today;
        if (localStorage.getItem(notifKey)) return; // check once per day
        localStorage.setItem(notifKey, "1");
        const projects = state.savedProjects || [];
        const tgLines = [];
        projects.forEach(proj => {
          if (!proj.deadline || ["Сдано", "Закрыто"].includes(proj.crmStatus || "")) return;
          const u = deadlineUrgency(proj.deadline);
          if (!u || u.level === "ok") return;
          const icon = u.level === "overdue" ? "🔴" : "⚡";
          pushNotification("deadline", icon + " " + (proj.name || "Проект"), u.label + (proj.client ? " · " + proj.client : ""), proj.id);
          tgLines.push(`${icon} <b>${escapeHtml(proj.name || "Проект")}</b> — ${u.label}${proj.client ? " · " + escapeHtml(proj.client) : ""}`);
        });
        if (tgLines.length && (state.telegramChatIds || []).length) {
          sendTelegramNotification("⏰ Дедлайны Adervis CRM:\n\n" + tgLines.join("\n"));
        }
      }

      initTheme();
      load();
      initEvents();
      if (_briefAgencyId) document.body.classList.add('brief-mode');
      if (_portalId) document.body.classList.add('portal-mode');
      render();
      initSupabase();
      checkVKCallback();
      if (_portalId) loadPortalData();
      setTimeout(initSwipeToDelete, 800);
      setTimeout(checkDeadlineNotifications, 1200);
    })();
