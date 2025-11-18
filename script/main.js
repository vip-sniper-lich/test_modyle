import { MonsterRandomizer } from './monster-randomizer.js';

Hooks.once('init', () => {
    console.log('PF2E Monster Randomizer | Initializing');
    
    // Регистрируем настройки модуля
    game.settings.register('pf2e-monster-randomizer', 'allowedPlayers', {
        name: 'Allowed Players',
        hint: 'Players who can activate the randomizer',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        onChange: value => {
            console.log('Allowed players updated:', value);
        }
    });
});

Hooks.once('ready', () => {
    console.log('PF2E Monster Randomizer | Ready');
    
    // Создаем экземпляр рандомайзера
    game.monsterRandomizer = new MonsterRandomizer();
});

// Обработчик макроса
Hooks.on('hotbarDrop', (bar, data, slot) => {
    if (data.type === 'Macro' && data.flags?.pf2eMonsterRandomizer) {
        game.monsterRandomizer.showRandomizerUI();
        return false;
    }
});