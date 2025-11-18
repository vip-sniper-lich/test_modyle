export class MonsterRandomizer {
    constructor() {
        this.allowedPlayers = [];
        this.currentPlayers = [];
    }
    
    // Показать интерфейс рандомайзера
    async showRandomizerUI() {
        const template = await renderTemplate('modules/pf2e-monster-randomizer/templates/randomizer-ui.html', {
            allowedPlayers: this.getAllPlayerNames(),
            currentPlayers: this.currentPlayers
        });
        
        new Dialog({
            title: 'Monster Randomizer',
            content: template,
            buttons: {
                randomize: {
                    icon: '<i class="fas fa-dice"></i>',
                    label: 'Randomize Monsters',
                    callback: (html) => this.handleRandomize(html)
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: 'Cancel'
                }
            },
            default: 'randomize',
            render: (html) => this.initializeUI(html)
        }).render(true);
    }
    
    // Инициализация UI
    initializeUI(html) {
        const allowedPlayers = game.settings.get('pf2e-monster-randomizer', 'allowedPlayers');
        this.allowedPlayers = allowedPlayers.split(',').map(name => name.trim());
        
        // Заполняем список игроков
        const playerSelect = html.find('#playerList');
        playerSelect.empty();
        
        this.getAllPlayerNames().forEach(playerName => {
            playerSelect.append(`<option value="${playerName}">${playerName}</option>`);
        });
        
        // Обновляем список текущих игроков
        this.updateCurrentPlayersDisplay(html);
        
        // Обработчики событий
        html.find('#addPlayer').click(() => this.addPlayer(html));
        html.find('#removePlayer').click(() => this.removePlayer(html));
    }
    
    // Получить имена всех игроков
    getAllPlayerNames() {
        return game.users.contents
            .filter(user => !user.isGM)
            .map(user => user.name);
    }
    
    // Добавить игрока в список
    addPlayer(html) {
        const selectedPlayer = html.find('#playerList').val();
        if (selectedPlayer && !this.currentPlayers.includes(selectedPlayer)) {
            this.currentPlayers.push(selectedPlayer);
            this.updateCurrentPlayersDisplay(html);
        }
    }
    
    // Удалить игрока из списка
    removePlayer(html) {
        const selectedCurrent = html.find('#currentPlayers').val();
        if (selectedCurrent) {
            this.currentPlayers = this.currentPlayers.filter(player => player !== selectedCurrent);
            this.updateCurrentPlayersDisplay(html);
        }
    }
    
    // Обновить отображение текущих игроков
    updateCurrentPlayersDisplay(html) {
        const currentPlayersSelect = html.find('#currentPlayers');
        currentPlayersSelect.empty();
        
        this.currentPlayers.forEach(player => {
            currentPlayersSelect.append(`<option value="${player}">${player}</option>`);
        });
    }
    
    // Обработка рандомизации
    async handleRandomize(html) {
        const encounterLevel = parseInt(html.find('#encounterLevel').val()) || 1;
        const monsterCount = parseInt(html.find('#monsterCount').val()) || 1;
        
        if (this.currentPlayers.length === 0) {
            ui.notifications.warn('Please add at least one player');
            return;
        }
        
        // Рассчитываем сложность
        const xpBudget = this.calculateXPBudget(this.currentPlayers.length, encounterLevel);
        const monsters = await this.getRandomMonsters(xpBudget, monsterCount);
        
        // Показываем результат всем игрокам
        this.showResultsToPlayers(monsters, encounterLevel);
    }
    
    // Рассчитать XP бюджет по формуле PF2e
    calculateXPBudget(playerCount, encounterLevel) {
        // Базовая сложность для 4 игроков
        const baseXP = {
            1: 40,   // Trivial
            2: 60,   // Low
            3: 80,   // Moderate
            4: 120,  // Severe
            5: 160   // Extreme
        }[encounterLevel] || 80;
        
        // Корректировка по количеству игроков
        const playerAdjustment = playerCount - 4;
        const adjustedXP = baseXP + (playerAdjustment * 20);
        
        return Math.max(adjustedXP, 40);
    }
    
    // Получить случайных монстров
    async getRandomMonsters(xpBudget, monsterCount) {
        const monsters = [];
        const availableMonsters = await this.getAvailableMonsters();
        
        // Сортируем монстров по уровню сложности
        const sortedMonsters = availableMonsters.sort((a, b) => a.system.details.level.value - b.system.details.level.value);
        
        let remainingXP = xpBudget;
        
        for (let i = 0; i < monsterCount && remainingXP > 0 && sortedMonsters.length > 0; i++) {
            // Фильтруем монстров по оставшемуся XP бюджету
            const affordableMonsters = sortedMonsters.filter(monster => {
                const monsterXP = this.getMonsterXP(monster.system.details.level.value);
                return monsterXP <= remainingXP;
            });
            
            if (affordableMonsters.length === 0) break;
            
            // Выбираем случайного монстра
            const randomIndex = Math.floor(Math.random() * affordableMonsters.length);
            const selectedMonster = affordableMonsters[randomIndex];
            const monsterXP = this.getMonsterXP(selectedMonster.system.details.level.value);
            
            monsters.push({
                monster: selectedMonster,
                xp: monsterXP
            });
            
            remainingXP -= monsterXP;
            
            // Удаляем выбранного монстра из доступных (чтобы избежать повторов)
            const monsterIndex = sortedMonsters.findIndex(m => m.id === selectedMonster.id);
            if (monsterIndex > -1) {
                sortedMonsters.splice(monsterIndex, 1);
            }
        }
        
        return {
            monsters: monsters,
            totalXP: xpBudget - remainingXP,
            remainingXP: remainingXP
        };
    }
    
    // Получить доступных монстров из бестиария
    async getAvailableMonsters() {
        const packs = game.packs.filter(pack => pack.metadata.type === 'Actor' && pack.metadata.label.includes('Bestiary'));
        let monsters = [];
        
        for (let pack of packs) {
            await pack.getIndex();
            const packMonsters = pack.index.filter(actor => actor.type === 'npc');
            
            for (let monsterData of packMonsters) {
                const monster = await pack.getDocument(monsterData._id);
                if (monster) {
                    monsters.push(monster);
                }
            }
        }
        
        return monsters;
    }
    
    // Получить XP стоимость монстра по уровню
    getMonsterXP(level) {
        // Базовая таблица XP для PF2e
        const xpTable = {
            '-4': 10, '-3': 15, '-2': 20, '-1': 30,
            '0': 40, '1': 60, '2': 80, '3': 120, '4': 160,
            '5': 200, '6': 240, '7': 280, '8': 320, '9': 360,
            '10': 400, '11': 440, '12': 480, '13': 520, '14': 560,
            '15': 600, '16': 640, '17': 680, '18': 720, '19': 760,
            '20': 800, '21': 840, '22': 880, '23': 920, '24': 960
        };
        
        return xpTable[level] || 40;
    }
    
    // Показать результаты игрокам
    async showResultsToPlayers(encounterData, encounterLevel) {
        const template = await renderTemplate('modules/pf2e-monster-randomizer/templates/encounter-results.html', {
            encounterData: encounterData,
            encounterLevel: encounterLevel,
            playerCount: this.currentPlayers.length
        });
        
        // Отправляем чат-сообщение с результатами
        const chatData = {
            content: template,
            speaker: ChatMessage.getSpeaker({alias: 'Monster Randomizer'}),
            whisper: this.allowedPlayers
        };
        
        ChatMessage.create(chatData);
        
        // Создаем актеров на сцене
        for (let monsterData of encounterData.monsters) {
            const actorData = monsterData.monster.toObject();
            await Actor.create(actorData);
        }
    }
}