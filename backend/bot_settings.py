"""Public bot profile shared by the configuration command and polling worker."""
NAME = 'Device Workshop | Ремонт техники'
DESCRIPTION = (
    'Мастерская Тиграна в Москве. Ремонт Apple и Android, компьютеров и ноутбуков. '
    'Защитные стёкла, гидрогелевая плёнка, копирование и печать А4.\n\n'
    'Услуги и цены — в Mini App. Выберите услугу и подготовьте сообщение мастеру.\n\n'
    'Москва, проспект Куприна, 34, корпус 2\n'
    'Ежедневно 10:00–20:00\n+7 977 997-76-77\nМастер: @DeviceWorkshop'
)
SHORT_DESCRIPTION = 'Ремонт Apple и Android, компьютеров. Печать А4. Москва, Куприна, 34к2. Мастер: @DeviceWorkshop'
COMMANDS = [
    {'command': 'start', 'description': 'Главное меню'},
    {'command': 'repair', 'description': 'Выбрать услугу и написать мастеру'},
    {'command': 'prices', 'description': 'Услуги и цены'},
    {'command': 'print', 'description': 'Копирование и печать А4'},
    {'command': 'contacts', 'description': 'Телефон, адрес и маршрут'},
    {'command': 'hours', 'description': 'Время работы'},
    {'command': 'site', 'description': 'Сайт и полезные статьи'},
    {'command': 'help', 'description': 'Как обратиться в мастерскую'},
]
