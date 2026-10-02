import { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 進行中的遊戲管理 (Key: channelId, Value: gameState)
const activeGames = new Map();
// 大廳正在組隊的名單 (Key: channelId, Value: { leaderId, members: [userId] })
const lobbyTeams = new Map();

// 職業定義與技能設定
const CLASSES = {
  warrior: {
    name: '戰士',
    emoji: '🛡️',
    avatar: '/photo/Warrior.webp',
    maxHp: 120,
    desc: '【生命 120】前排坦鋒。具備強大的守護壁壘，全技能皆為物理傷害。',
    skills: [
      { id: 'basic', label: '普通攻擊', style: ButtonStyle.Secondary, cd: 0, dmgType: 'phys', desc: '【物理】揮動武器打擊（傷害: 10）' },
      { id: 'w_strike', label: '堅定斬擊', style: ButtonStyle.Primary, cd: 0, dmgType: 'phys', desc: '【物理】堅定重斬（傷害: 15，無CD）' },
      { id: 'w_shield', label: '壁壘守護', style: ButtonStyle.Success, cd: 2, desc: '第1回合阻擋90%傷害，第2回合阻擋40%，第3回合失效（需休息2回合）' }
    ]
  },
  mage: {
    name: '法師',
    emoji: '🧙‍♂️',
    avatar: '/photo/Mage.webp',
    maxHp: 80,
    desc: '【生命 80】遠程法系。站樁高爆發與生命汲取，全技能皆為魔法傷害。',
    skills: [
      { id: 'basic', label: '普通攻擊', style: ButtonStyle.Secondary, cd: 0, dmgType: 'mag', desc: '【魔法】引導微光魔法打擊（傷害: 10）' },
      { id: 'm_blast', label: '奧術爆破', style: ButtonStyle.Danger, cd: 1, dmgType: 'mag', desc: '【魔法】引爆奧術轟出巨額傷害（傷害: 40，需休息1回合）' },
      { id: 'm_drain', label: '生命汲取', style: ButtonStyle.Primary, cd: 1, dmgType: 'mag', desc: '【魔法】造成 15~20 傷害，吸取該傷害 20% 生命（需休息1回合）' }
    ]
  },
  archer: {
    name: '弓箭手',
    emoji: '🏹',
    avatar: '/photo/Archer.webp',
    maxHp: 80,
    dodgeRate: 0.4,
    desc: '【生命 80】遠程敏捷。常駐 40% 閃避，普攻與1技能為物理，2技能為魔法。',
    skills: [
      { id: 'basic', label: '普通攻擊', style: ButtonStyle.Secondary, cd: 0, dmgType: 'phys', desc: '【物理】拉弓射出基礎箭矢（傷害: 10）' },
      { id: 'a_shot', label: '精準狙擊', style: ButtonStyle.Primary, cd: 1, dmgType: 'phys', desc: '【物理】百步穿楊狙擊（傷害: 30，需休息1回合）' },
      { id: 'a_rain', label: '箭雨壓制', style: ButtonStyle.Success, cd: 1, dmgType: 'mag', desc: '【魔法】附魔箭雨壓制（傷害: 20，削弱怪物 10 點攻擊，需休息1回合）' }
    ]
  },
  assassin: {
    name: '刺客',
    emoji: '🗡️',
    avatar: '/photo/Assassin.webp',
    maxHp: 60,
    critRate: 0.5,
    vulnerableMod: 1.25,
    desc: '【生命 60】近戰爆發。自帶 50% 暴擊，全技能皆為物理傷害。',
    skills: [
      { id: 'basic', label: '普通攻擊', style: ButtonStyle.Secondary, cd: 0, dmgType: 'phys', desc: '【物理】揮動雙匕進行基本切削（傷害: 10）' },
      { id: 's_stab', label: '暗影刺殺', style: ButtonStyle.Danger, cd: 1, dmgType: 'phys', desc: '【物理】背刺（傷害 30，暴擊造成 60 且暴擊時無CD；未暴擊需休息1回合）' },
      { id: 's_smoke', label: '煙霧匿蹤', style: ButtonStyle.Secondary, cd: 2, desc: '隱入陰影避開本回合攻擊，但下次攻擊無法暴擊（需休息2回合）' }
    ]
  },
  bard: {
    name: '吟遊詩人',
    emoji: '🪕',
    avatar: '/photo/Bard.webp',
    maxHp: 70,
    desc: '【生命 70】團隊核心輔助。普攻為魔法傷害，精通全體群療、增傷減傷與奇蹟甦生。',
    skills: [
      { id: 'basic', label: '普通攻擊', style: ButtonStyle.Secondary, cd: 0, dmgType: 'mag', desc: '【魔法】撥動琴弦引導音波魔法打擊（傷害: 10）' },
      { id: 'b_heal', label: '治癒頌歌', style: ButtonStyle.Success, cd: 1, desc: '全體回血，指定一名隊友額外回復生命（需休息1回合）' },
      { id: 'b_buff', label: '狂熱協奏', style: ButtonStyle.Primary, cd: 1, desc: '激勵全隊：增傷 50%、減傷 25%，且削弱敵方雙抗至 65%（需休息1回合）' }
    ]
  }
};

// 裝備池
const LOOT_TABLE = [
  { role: 'warrior', name: '重鋼巨劍', bonusAtk: 12, desc: '戰士攻擊傷害 +12' },
  { role: 'warrior', name: '荊棘重鎧', bonusHp: 30, desc: '戰士最大生命值 +30' },
  { role: 'mage', name: '虛空魔杖', bonusAtk: 15, desc: '法師攻擊傷害 +15' },
  { role: 'mage', name: '大魔導護符', bonusHp: 20, desc: '法師最大生命值 +20' },
  { role: 'archer', name: '破甲獵弓', bonusAtk: 12, desc: '弓箭手狙擊傷害 +12' },
  { role: 'archer', name: '靈巧披風', bonusHp: 20, desc: '弓箭手最大生命值 +20' },
  { role: 'assassin', name: '染毒刺刃', bonusAtk: 10, desc: '刺客基礎攻擊 +10（暴擊時翻倍）' },
  { role: 'assassin', name: '暗影皮甲', bonusHp: 25, desc: '刺客最大生命值 +25' },
  { role: 'bard', name: '精靈木豎琴', bonusAtk: 10, desc: '詩人音律傷害 +10' },
  { role: 'bard', name: '祝福絲綢袍', bonusHp: 25, desc: '詩人最大生命值 +25' }
];

// 怪物庫
const ENCOUNTERS = [
  { 
    name: '地底熔岩巨像', 
    hp: 100, 
    desc: '巨石與高溫熔岩構成的巨像，岩石外殼極為厚重！', 
    attack: 10,
    resistance: 'phys',
    ultName: '崩山滅世重砸'
  },
  { 
    name: '暗影魔狼族長', 
    hp: 70, 
    desc: '動作敏捷的狼王，周身幽暗的暗影能量流動！', 
    attack: 5,
    resistance: 'mag',
    ultName: '血影狂暴撕裂'
  },
  { 
    name: '古代守護魔偶', 
    hp: 120, 
    desc: '鋼鐵機體具備堅固的物理防禦壁壘！', 
    attack: 15,
    resistance: 'phys',
    ultName: '過載超導電弧'
  },
  { 
    name: '赤月嗜血巫師', 
    hp: 100, 
    desc: '赤月能量構築出強大的魔法護盾！', 
    attack: 15,
    resistance: 'mag',
    ultName: '赤月血幕絕罰'
  },
  { 
    name: '深淵腐蝕巨蟒', 
    hp: 110, 
    desc: '毒沼中的巨蟒，體表黏液對元素魔法有極高抗性！', 
    attack: 12,
    resistance: 'mag',
    ultName: '滅絕劇毒狂湧'
  },
  { 
    name: '霜骨亡靈騎士', 
    hp: 120, 
    desc: '身披玄鐵重鎧的古老騎兵，刀槍難入！', 
    attack: 14,
    resistance: 'phys',
    ultName: '寒霜斷頭烈斬'
  },
  { 
    name: '迷宮食腐暴食魔', 
    hp: 160, 
    desc: '體型龐大且長滿利齒的惡臭憎惡，飢渴地撲向生者！', 
    attack: 8,
    resistance: 'none',
    ultName: '吞天噬地暴嚼'
  },
  { 
    name: '幻惑幽魂歌姬', 
    hp: 80, 
    desc: '純粹的精神虛無體，一般法術難以侵蝕其心智！', 
    attack: 16,
    resistance: 'mag',
    ultName: '亡靈攝魂尖叫'
  },
  { 
    name: '結晶守護巨蠍', 
    hp: 115, 
    desc: '紫晶甲殼堅不可摧，擅長彈開物理兵刃！', 
    attack: 13,
    resistance: 'phys',
    ultName: '晶化貫通連刺'
  },
  { 
    name: '煉獄炎獄行者', 
    hp: 145, 
    desc: '自地心火海中爬出的惡魔，氣息粗暴凶悍！', 
    attack: 13,
    resistance: 'none',
    ultName: '末日天火焚世'
  }
];

// 血量進度條
function generateHpBar(current, max, length = 10) {
  const percent = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(percent * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

// 建立選角面板
function buildRoleSelectionPayload(state) {
  const pickedRoles = Object.values(state.players).map(p => `• <@${p.user.id}> 鎖定了 **${CLASSES[p.role].emoji} ${CLASSES[p.role].name}**`);
  const pickedText = pickedRoles.length > 0 ? `\n\n**【目前已準備的冒險者】**\n${pickedRoles.join('\n')}` : '';

  const introEmbed = new EmbedBuilder()
    .setTitle('🏰 地城冒險：英雄集結與選職')
    .setDescription(
      `👑 **隊長**：<@${state.leaderId}>\n` +
      `👥 **冒險隊伍**（${state.memberIds.length} 人）：${state.memberIds.map(id => `<@${id}>`).join(' ')}\n\n` +
      `請每位冒險者點擊下方按鈕選取職業（各職業不可重複）：` + pickedText
    )
    .setColor(0x3B82F6);

  const takenRoles = Object.values(state.players).map(p => p.role);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pick_warrior').setLabel('戰士').setStyle(ButtonStyle.Primary).setEmoji('🛡️').setDisabled(takenRoles.includes('warrior')),
    new ButtonBuilder().setCustomId('pick_mage').setLabel('法師').setStyle(ButtonStyle.Danger).setEmoji('🧙‍♂️').setDisabled(takenRoles.includes('mage')),
    new ButtonBuilder().setCustomId('pick_archer').setLabel('弓箭手').setStyle(ButtonStyle.Success).setEmoji('🏹').setDisabled(takenRoles.includes('archer'))
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pick_assassin').setLabel('刺客').setStyle(ButtonStyle.Secondary).setEmoji('🗡️').setDisabled(takenRoles.includes('assassin')),
    new ButtonBuilder().setCustomId('pick_bard').setLabel('吟遊詩人').setStyle(ButtonStyle.Primary).setEmoji('🪕').setDisabled(takenRoles.includes('bard'))
  );

  return { embeds: [introEmbed], components: [row1, row2] };
}

// 建立大廳面板
function createLobbyPayload() {
  const lobbyEmbed = new EmbedBuilder()
    .setTitle('🏰【地城冒險者公會看板】')
    .setDescription(
      '歡迎來到地下城入口！在此招募你的隊伍成員一同探險。\n\n' +
      '• 點擊 **「⚔️ 發起組隊」** 成立小隊成為隊長\n' +
      '• 好友點擊 **「✋ 加入隊伍」** 登記入隊（1～5人，可單人單挑）\n' +
      '• 隊長點擊 **「🚀 出發探險」** 即可開啟冒險！\n\n' +
      '*如冒險遇阻，隨時輸入 `/stop` 或 `!stop` 可終止進行中的遊戲。*'
    )
    .setColor(0x3B82F6);

  const lobbyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lobby_create').setLabel('⚔️ 發起組隊').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('lobby_join').setLabel('✋ 加入隊伍').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lobby_start').setLabel('🚀 出發探險').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [lobbyEmbed], components: [lobbyRow] };
}

async function getSafeChannel(channelId, fallbackChannel) {
  if (fallbackChannel && typeof fallbackChannel.send === 'function') return fallbackChannel;
  try {
    return await client.channels.fetch(channelId);
  } catch (err) {
    return null;
  }
}

async function sendToChannel(channelId, payload) {
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased()) return await ch.send(payload);
  } catch (e) {
    console.error(`向頻道發送訊息失敗：`, e);
  }
  return null;
}

function equipItemToPlayer(player, drop) {
  player.equipCounts[drop.name] = (player.equipCounts[drop.name] || 0) + 1;
  if (drop.bonusAtk) player.bonusAtk += drop.bonusAtk;
  if (drop.bonusHp) {
    player.maxHp += drop.bonusHp;
    player.hp += drop.bonusHp;
  }
}

function formatPlayerEquips(player) {
  const entries = Object.entries(player.equipCounts);
  if (entries.length === 0) return '';
  const list = entries.map(([name, count]) => count > 1 ? `${name} x${count}` : name);
  return ` [裝備: ${list.join(', ')}]`;
}

// 機器人啟動註冊指令
client.on('ready', async () => {
  console.log(`Bot 登入成功：${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName('startgame').setDescription('招募冒險小隊並建立地城大廳看板'),
    new SlashCommandBuilder().setName('stop').setDescription('強制終止當前頻道進行中的地城冒險或組隊')
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    if (process.env.GUILD_ID) {
      console.log(`正在向伺服器 (${process.env.GUILD_ID}) 即時註冊指令...`);
      await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commands });
      console.log('✅ 伺服器專用斜線指令註冊完成！');
    } else {
      console.log('正在向 Discord 註冊全域斜線指令...');
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('✅ 全域斜線指令註冊完成！');
    }
  } catch (error) {
    console.error('註冊斜線指令失敗：', error);
  }
});

// 後備文字指令
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (content === '!startgame' || content === '!start') {
    await message.channel.send(createLobbyPayload());
    await message.delete().catch(() => {});
    return;
  }

  if (content === '!stop') {
    const channelId = message.channel.id;
    const game = activeGames.get(channelId);
    const lobby = lobbyTeams.get(channelId);

    if (!game && !lobby) return message.reply('目前這個頻道沒有進行中的組隊或地城冒險！');

    if (lobby) {
      lobbyTeams.delete(channelId);
      return message.channel.send('🏳️ **大廳組隊已取消！**');
    }

    if (game) {
      if (!game.memberIds.includes(message.author.id)) return message.reply('只有冒險小隊的成員可以終止遊戲！');
      clearTimeout(game.turnTimer);
      activeGames.delete(channelId);
      return message.channel.send('🏳️ **遊戲已被手動終止！** 冒險小隊已解散。');
    }
  }
});

// ==========================================
// 互動監聽與按鈕事件處理
// ==========================================
client.on('interactionCreate', async (interaction) => {
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'startgame') {
        return await interaction.reply(createLobbyPayload());
      }

      if (interaction.commandName === 'stop') {
        const game = activeGames.get(channelId);
        const lobby = lobbyTeams.get(channelId);

        if (!game && !lobby) return await interaction.reply({ content: '目前沒有進行中的組隊或冒險！', ephemeral: true });

        if (lobby) {
          lobbyTeams.delete(channelId);
          return await interaction.reply('🏳️ **大廳組隊已取消！**');
        }

        if (game) {
          if (!game.memberIds.includes(userId)) return await interaction.reply({ content: '只有小隊成員可以終止遊戲！', ephemeral: true });
          clearTimeout(game.turnTimer);
          activeGames.delete(channelId);
          return await interaction.reply('🏳️ **遊戲已被手動終止！** 冒險小隊已解散。');
        }
      }
      return;
    }

    if (!interaction.isButton()) return;
    const customId = interaction.customId;

    if (customId === 'lobby_create') {
      if (activeGames.has(channelId)) return interaction.reply({ content: '此頻道目前正有一場地城冒險進行中！', ephemeral: true });
      if (lobbyTeams.has(channelId)) return interaction.reply({ content: '目前已經有人在組隊了，請點擊「加入隊伍」！', ephemeral: true });

      lobbyTeams.set(channelId, { leaderId: userId, members: [userId] });
      return interaction.reply({ content: `⚔️ <@${userId}> 成立了冒險小隊！目前成員 (1/5)：<@${userId}>\n其他冒險者可點擊 **「✋ 加入隊伍」**，隊長也可隨時直接單人出發！` });
    }

    if (customId === 'lobby_join') {
      const lobby = lobbyTeams.get(channelId);
      if (!lobby) return interaction.reply({ content: '目前沒有待出發的隊伍，請先點擊「發起組隊」！', ephemeral: true });
      if (lobby.members.includes(userId)) return interaction.reply({ content: '你已經在隊伍中了！', ephemeral: true });
      if (lobby.members.length >= 5) return interaction.reply({ content: '小隊已滿額（上限 5 人）！', ephemeral: true });

      lobby.members.push(userId);
      const memberMentions = lobby.members.map(id => `<@${id}>`).join(', ');
      return interaction.reply({ content: `✋ <@${userId}> 加入了小隊！當前隊員 (${lobby.members.length}/5)：${memberMentions}` });
    }

    if (customId === 'lobby_start') {
      const lobby = lobbyTeams.get(channelId);
      if (!lobby) return interaction.reply({ content: '目前沒有隊伍，請先「發起組隊」！', ephemeral: true });
      if (userId !== lobby.leaderId) return interaction.reply({ content: '只有發起隊伍的【隊長】可以點擊出發！', ephemeral: true });

      const targetChannel = await getSafeChannel(channelId, interaction.channel);
      const gameState = {
        channelId: channelId,
        channel: targetChannel,
        leaderId: lobby.leaderId,
        memberIds: [...lobby.members],
        players: {},
        floor: 1,
        state: 'SELECTING_ROLE',
        currentMonster: null,
        turnTimer: null,
        battleRound: 1,
        warriorShieldTurn: 0
      };

      activeGames.set(channelId, gameState);
      lobbyTeams.delete(channelId);

      const rolePayload = buildRoleSelectionPayload(gameState);
      await interaction.reply({ content: '小隊集結完畢，地城之門開啟！' });
      await sendToChannel(channelId, rolePayload);

      gameState.turnTimer = setTimeout(() => {
        if (gameState.state === 'SELECTING_ROLE') {
          activeGames.delete(channelId);
          sendToChannel(channelId, { content: '⏱️ 選擇職業超時，冒險終止。' });
        }
      }, 60000);
      return;
    }

    const game = activeGames.get(channelId);
    if (!game) return interaction.reply({ content: '這場冒險已經結束或已被終止。', ephemeral: true }).catch(() => {});

    if (customId === 'btn_quit') {
      if (!game.memberIds.includes(userId)) return interaction.reply({ content: '你不是隊伍成員！', ephemeral: true });
      clearTimeout(game.turnTimer);
      activeGames.delete(channelId);
      await interaction.reply({ content: '已申請全隊撤退。', ephemeral: true });
      const targetChannel = await getSafeChannel(channelId, game.channel);
      return targetChannel?.send(`🏳️ <@${userId}> 帶領小隊撤退，冒險終止。`);
    }

    if (game.state === 'SELECTING_ROLE' && customId.startsWith('pick_')) {
      if (!game.memberIds.includes(userId)) return interaction.reply({ content: '你不是這支探險小隊的成員！', ephemeral: true });
      if (game.players[userId]) return interaction.reply({ content: `你已經選擇了【${CLASSES[game.players[userId].role].name}】！`, ephemeral: true });

      const roleKey = customId.replace('pick_', '');
      const isTaken = Object.values(game.players).some(p => p.role === roleKey);
      if (isTaken) return interaction.reply({ content: `【${CLASSES[roleKey].name}】已被隊友選走，請選其他職業！`, ephemeral: true });

      const initialCooldowns = {};
      CLASSES[roleKey].skills.forEach(s => { initialCooldowns[s.id] = 0; });

      game.players[userId] = {
        user: interaction.user,
        role: roleKey,
        hp: CLASSES[roleKey].maxHp,
        maxHp: CLASSES[roleKey].maxHp,
        bonusAtk: 0,
        equipCounts: {},
        cooldowns: initialCooldowns,
        action: null,
        targetPlayerId: null,
        cannotCrit: false,
        isStealthed: false,
        stunnedNextTurn: false,
        bleedTurns: 0,
        bardHealGroupBonus: 0,
        bardHealSingleBonus: 0
      };

      await interaction.reply({ content: `你已成功選擇：**${CLASSES[roleKey].emoji} ${CLASSES[roleKey].name}**！`, ephemeral: true });
      
      const updatedPayload = buildRoleSelectionPayload(game);
      await interaction.message.edit(updatedPayload).catch(console.error);

      if (Object.keys(game.players).length === game.memberIds.length) {
        clearTimeout(game.turnTimer);
        const targetChannel = await getSafeChannel(channelId, game.channel);
        await targetChannel?.send({
          embeds: [new EmbedBuilder().setTitle('⚔️ 隊員全數就緒，踏入地城！').setColor(0x10B981)]
        });
        setTimeout(() => startRouteSelection(game), 2000);
      }
      return;
    }

    if (game.state === 'CHECKPOINT' && (customId === 'checkpoint_continue' || customId === 'checkpoint_end')) {
      if (userId !== game.leaderId) return interaction.reply({ content: '只有【隊長】可以決定是否繼續冒險！', ephemeral: true });
      clearTimeout(game.turnTimer);

      if (customId === 'checkpoint_end') {
        activeGames.delete(channelId);
        await interaction.reply({ content: '隊長決定滿載而歸！', ephemeral: true });
        return sendToChannel(channelId, {
          embeds: [
            new EmbedBuilder()
              .setTitle('🏆【榮耀凱旋】冒險小隊凱旋歸來！')
              .setDescription(`小隊成功突破至第 **${game.floor}** 層並安全撤出！獲得無數金銀財寶與勇者美名！`)
              .setColor(0xF59E0B)
          ]
        });
      }

      for (const p of Object.values(game.players)) {
        if (p.hp > 0) p.hp = p.maxHp;
        p.bleedTurns = 0;
      }

      await interaction.reply({ content: '隊長決定深入深淵！全隊已受到聖光祝福回滿生命！', ephemeral: true });
      await sendToChannel(channelId, {
        embeds: [
          new EmbedBuilder()
            .setTitle('✨【神聖泉水休整】全體角色生命值完全回滿！')
            .setDescription('小隊在休整點飲下聖水，全員重振旗鼓，踏向更幽深的未知地層！')
            .setColor(0x10B981)
        ]
      });

      game.floor += 1;
      setTimeout(() => startRouteSelection(game), 3000);
      return;
    }

    if (game.state === 'CHOOSING_ROUTE' && customId.startsWith('route_')) {
      if (userId !== game.leaderId) return interaction.reply({ content: '只有【隊長】可以決定前進路線！', ephemeral: true });
      clearTimeout(game.turnTimer);
      await interaction.reply({ content: '隊長做出了抉擇，全隊整裝前進！', ephemeral: true });
      return resolveRouteChoice(game);
    }

    if (game.state === 'IN_BATTLE' && customId === 'btn_skip_turn') {
      const player = game.players[userId];
      if (!player) return interaction.reply({ content: '你不是隊伍成員！', ephemeral: true });
      if (player.hp <= 0) return interaction.reply({ content: '你已陣亡，無法行動！', ephemeral: true });
      if (player.stunnedNextTurn) return interaction.reply({ content: '你處於脫力虛脫中，已自動略過行動！', ephemeral: true });

      player.action = 'skip';
      await interaction.reply({ content: '⏸️ 你選擇了本回合【跳過行動（發呆防禦）】！等待隊友中...', ephemeral: true });
      checkTurnCompletion(game);
      return;
    }

    if (game.state === 'IN_BATTLE' && customId === 'btn_open_skills') {
      const player = game.players[userId];
      if (!player) return interaction.reply({ content: '你不是隊伍成員！', ephemeral: true });
      if (player.hp <= 0) return interaction.reply({ content: '你已陣亡，無法行動！', ephemeral: true });

      if (player.stunnedNextTurn) {
        return interaction.reply({
          content: '💫 **【脫力虛脫中】** 你正處於復活術後遺症的虛弱狀態，本回合無法採取任何行動！請靜養休息。',
          ephemeral: true
        });
      }

      const roleConfig = CLASSES[player.role];
      const buttons = roleConfig.skills.map(s => {
        const cdRemain = player.cooldowns[s.id] || 0;
        return new ButtonBuilder()
          .setCustomId(`act_${s.id}`)
          .setLabel(cdRemain > 0 ? `${s.label} [CD: ${cdRemain}]` : s.label)
          .setStyle(s.style)
          .setDisabled(cdRemain > 0);
      });

      buttons.push(
        new ButtonBuilder()
          .setCustomId('act_skip')
          .setLabel('⏭️ 跳過回合')
          .setStyle(ButtonStyle.Secondary)
      );

      let reviveDesc = '';
      if (player.role === 'bard') {
        const deadPlayers = Object.values(game.players).filter(p => p.hp <= 0);
        if (deadPlayers.length > 0) {
          buttons.push(
            new ButtonBuilder()
              .setCustomId('act_b_revive')
              .setLabel('🕊️ 甦生之歌 (復活)')
              .setStyle(ButtonStyle.Danger)
          );
          reviveDesc = '\n• 🕊️ **甦生之歌**：奇蹟般喚醒一名倒下的隊友（恢復35%生命），代價是下回合雙方皆無法行動！';
        }
      }

      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      const skillDesc = roleConfig.skills.map(s => {
        const cdRemain = player.cooldowns[s.id] || 0;
        const cdText = cdRemain > 0 ? ` ⚠️ **冷卻中（剩餘 ${cdRemain} 回合）**` : '';
        return `• **${s.label}**：${s.desc}${cdText}`;
      }).join('\n');

      let statusNotice = '';
      if (player.cannotCrit) statusNotice += '\n⚠️ **【匿蹤代價】：你本次攻擊將無法產生暴擊！**';
      if (player.bleedTurns > 0) statusNotice += `\n🩸 **【撕裂流血中】：每回合初受到撕裂傷害（剩餘 ${player.bleedTurns} 回合）**`;

      return interaction.reply({
        content: `【${roleConfig.emoji} ${roleConfig.name} - 專屬面板】\n${generateHpBar(player.hp, player.maxHp, 10)} HP: ${player.hp}/${player.maxHp} (額外攻擊加成: +${player.bonusAtk})${statusNotice}\n\n${skillDesc}${reviveDesc}\n• **跳過回合**：本回合放棄行動，保留技能CD\n\n請暗中指定施放行動：`,
        components: rows,
        ephemeral: true
      });
    }

    if (game.state === 'IN_BATTLE' && customId.startsWith('target_heal_')) {
      const player = game.players[userId];
      if (!player || player.hp <= 0 || player.stunnedNextTurn) return interaction.reply({ content: '你無法執行此行動！', ephemeral: true });

      const targetId = customId.replace('target_heal_', '');
      player.action = 'b_heal';
      player.targetPlayerId = targetId;

      const targetPlayer = game.players[targetId];
      const targetName = targetPlayer ? targetPlayer.user.username : '隊友';

      await interaction.update({ 
        content: `✅ 已鎖定【治癒頌歌】！將為全隊回血，並專注為 **${targetName}** 額外回復生命！等待其他隊友中...`, 
        components: [] 
      });

      checkTurnCompletion(game);
      return;
    }

    if (game.state === 'IN_BATTLE' && customId.startsWith('target_revive_')) {
      const player = game.players[userId];
      if (!player || player.hp <= 0 || player.stunnedNextTurn) return interaction.reply({ content: '你無法執行此行動！', ephemeral: true });

      const targetId = customId.replace('target_revive_', '');
      player.action = 'b_revive';
      player.targetPlayerId = targetId;

      const targetPlayer = game.players[targetId];
      const targetName = targetPlayer ? targetPlayer.user.username : '隊友';

      await interaction.update({ 
        content: `✅ 已唱響【甦生之歌】！將奇蹟復活 **${targetName}**！下回合你與該隊友都將陷入虛脫。等待結算中...`, 
        components: [] 
      });

      checkTurnCompletion(game);
      return;
    }

    if (game.state === 'IN_BATTLE' && customId.startsWith('act_')) {
      const player = game.players[userId];
      if (!player || player.hp <= 0 || player.stunnedNextTurn) return interaction.reply({ content: '你無法執行此行動！', ephemeral: true });

      const actionId = customId.replace('act_', '');

      if (actionId === 'skip') {
        player.action = 'skip';
        await interaction.update({ content: `✅ 本回合已選擇【跳過行動】！等待隊友中...`, components: [] });
        checkTurnCompletion(game);
        return;
      }

      if (actionId === 'b_revive') {
        const deadPlayers = Object.values(game.players).filter(p => p.hp <= 0);
        if (deadPlayers.length === 0) {
          return interaction.reply({ content: '目前場上沒有倒下的隊友需要復活！', ephemeral: true });
        }

        const reviveButtons = deadPlayers.map(deadP => 
          new ButtonBuilder()
            .setCustomId(`target_revive_${deadP.user.id}`)
            .setLabel(`🪦 復活 ${CLASSES[deadP.role].emoji} ${deadP.user.username}`)
            .setStyle(ButtonStyle.Danger)
        );

        const reviveRow = new ActionRowBuilder().addComponents(reviveButtons);
        return await interaction.update({
          content: '🕊️ **【生命迴響・甦生之歌】** 請選擇你要喚醒歸隊的隊友：\n*(代價：下回合你與被復活者都將脫力無法行動)*',
          components: [reviveRow]
        });
      }

      if ((player.cooldowns[actionId] || 0) > 0) {
        return interaction.reply({ content: '該技能仍在冷卻中，請選擇其他行動！', ephemeral: true });
      }

      if (actionId === 'b_heal') {
        const aliveAllys = Object.values(game.players).filter(p => p.hp > 0);
        if (aliveAllys.length > 1) {
          const targetButtons = aliveAllys.map(ally => 
            new ButtonBuilder()
              .setCustomId(`target_heal_${ally.user.id}`)
              .setLabel(`${CLASSES[ally.role].emoji} ${ally.user.username} (${ally.hp}/${ally.maxHp})`)
              .setStyle(ally.user.id === userId ? ButtonStyle.Success : ButtonStyle.Primary)
          );

          const targetRow = new ActionRowBuilder().addComponents(targetButtons);
          return await interaction.update({
            content: `🪕 請選擇你要額外專注回復生命的目標（全隊依然會獲得群體回復）：`,
            components: [targetRow]
          });
        } else {
          player.action = 'b_heal';
          player.targetPlayerId = userId;
          await interaction.update({ content: `✅ 行動已確認【治癒頌歌】！等待結算...`, components: [] });
          checkTurnCompletion(game);
          return;
        }
      }

      player.action = actionId;
      await interaction.update({ content: `✅ 行動已確認！等待隊友中...`, components: [] });
      checkTurnCompletion(game);
      return;
    }

    if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
  } catch (err) {
    console.error('互動處理錯誤：', err);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '系統處理稍有延遲，請重試！', ephemeral: true }).catch(() => {});
  }
});

function checkTurnCompletion(game) {
  const allDone = Object.values(game.players)
    .filter(p => p.hp > 0 && !p.stunnedNextTurn)
    .every(p => p.action !== null);

  if (allDone) {
    clearTimeout(game.turnTimer);
    resolveTurnActions(game);
  }
}

// ==========================================
// 流程與事件機制
// ==========================================

async function advanceToNextFloorOrCheckpoint(state) {
  if (state.floor % 5 === 0) {
    state.state = 'CHECKPOINT';
    const checkEmbed = new EmbedBuilder()
      .setTitle(`🏰【第 ${state.floor} 層 - 深淵休息站】`)
      .setDescription(
        `恭喜小隊成功突破至第 **${state.floor}** 層！前方是神聖的守護結界。\n\n` +
        `👑 **請隊長 <@${state.leaderId}> 決定小隊的下一步命運：**\n\n` +
        `• **【🔥 繼續挑戰】**：全員生命值 **100% 完全回滿**，並勇闖更危險的地層！\n` +
        `• **【🏆 榮耀結算】**：見好就收，滿載戰利品安全撤出地城，結束本次冒險！`
      )
      .setColor(0x3B82F6);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('checkpoint_continue').setLabel('🔥 全員回滿血，繼續挑戰！').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('checkpoint_end').setLabel('🏆 榮耀結算，結束冒險').setStyle(ButtonStyle.Secondary)
    );

    await sendToChannel(state.channelId, { embeds: [checkEmbed], components: [row] });

    state.turnTimer = setTimeout(() => {
      if (state.state === 'CHECKPOINT') {
        sendToChannel(state.channelId, { content: '⏱️ 隊長沈思許久，決定讓小隊在泉水前修整完畢並自動繼續前進！' });
        for (const p of Object.values(state.players)) {
          if (p.hp > 0) p.hp = p.maxHp;
          p.bleedTurns = 0;
        }
        state.floor += 1;
        startRouteSelection(state);
      }
    }, 45000);
  } else {
    state.floor += 1;
    startRouteSelection(state);
  }
}

async function startRouteSelection(state) {
  state.channel = await getSafeChannel(state.channelId, state.channel);

  const alivePlayers = Object.values(state.players).filter(p => p.hp > 0);
  if (alivePlayers.length === 0) {
    activeGames.delete(state.channelId);
    return state.channel?.send('💀 **全軍覆沒！** 小隊在地城中倒下了。');
  }

  state.state = 'CHOOSING_ROUTE';

  const routeEmbed = new EmbedBuilder()
    .setTitle(`🧭【第 ${state.floor} 層】分歧抉擇`)
    .setDescription(
      `前方出現了四條岔路，每一條都散發著未知的氣息...\n` +
      `*(本層敵方強度加成：+${Math.round((state.floor - 1) * 5)}%)*\n\n` +
      `👑 **請隊長 <@${state.leaderId}> 決定小隊前進路線：**\n\n` +
      `• 前方可能遭遇：**魔物伏擊 (戰鬥)**、**古老寶箱 (裝備與回血)** 或 **古代機關 (陷阱傷害)**`
    )
    .setColor(0xF59E0B);

  const allRouteOptions = [
    { id: 'route_trail', label: '羊腸小徑', style: ButtonStyle.Primary },
    { id: 'route_stream', label: '沿著溪流', style: ButtonStyle.Secondary },
    { id: 'route_stars', label: '跟隨星星', style: ButtonStyle.Success },
    { id: 'route_cave', label: '洞穴深處', style: ButtonStyle.Danger },
    { id: 'route_forest', label: '森林深處', style: ButtonStyle.Primary },
    { id: 'route_house', label: '隱約的房屋', style: ButtonStyle.Secondary }
  ];
  const chosenRoutes = [...allRouteOptions].sort(() => 0.5 - Math.random()).slice(0, 4);
  const row = new ActionRowBuilder().addComponents(
    chosenRoutes.map(r => new ButtonBuilder().setCustomId(r.id).setLabel(r.label).setStyle(r.style))
  );

  await state.channel?.send({ embeds: [routeEmbed], components: [row] });

  state.turnTimer = setTimeout(() => {
    if (state.state === 'CHOOSING_ROUTE') {
      state.channel?.send('⏱️ 隊長猶豫不決，小隊盲目摸黑向前前進！');
      resolveRouteChoice(state);
    }
  }, 30000);
}

async function resolveRouteChoice(state) {
  const rand = Math.random();
  if (rand < 0.25) {
    await handleTreasureEvent(state);
  } else if (rand < 0.5) {
    await handleTrapEvent(state);
  } else {
    await handleBattleEvent(state);
  }
}

async function handleTreasureEvent(state) {
  state.channel = await getSafeChannel(state.channelId, state.channel);

  for (const p of Object.values(state.players)) {
    if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + 25);
  }

  const activeRoles = Object.values(state.players).map(p => p.role);
  const eligibleLoots = LOOT_TABLE.filter(l => activeRoles.includes(l.role));
  const drop = eligibleLoots[Math.floor(Math.random() * eligibleLoots.length)];

  let equipOwner = null;
  for (const p of Object.values(state.players)) {
    if (p.role === drop.role) {
      equipOwner = p;
      equipItemToPlayer(p, drop);
      break;
    }
  }

  const chestEmbed = new EmbedBuilder()
    .setTitle(`🎁【第 ${state.floor} 層】發現遠古寶箱！`)
    .setDescription(
      `幸運降臨！小隊發現了完好無損的鍍金寶箱！\n\n` +
      `🧪 **治癒藥水**：全體存活隊友回復 **25** 點生命值！\n\n` +
      `💎 **裝備獲得**：【**${drop.name}**】 (當前持有: x${equipOwner.equipCounts[drop.name]})\n` +
      `• 適合職業：**${CLASSES[drop.role].emoji} ${CLASSES[drop.role].name}**\n` +
      `• 裝備效果：**${drop.desc}**（數值已直接疊加！）\n` +
      `• 穿戴者：<@${equipOwner.user.id}> 立即裝備上了此道具！`
    )
    .setColor(0x10B981);

  await state.channel?.send({ embeds: [chestEmbed] });
  setTimeout(() => advanceToNextFloorOrCheckpoint(state), 3500);
}

async function handleTrapEvent(state) {
  state.channel = await getSafeChannel(state.channelId, state.channel);
  const log = ['⚠️ 小隊踩中了地板機關！牆縫中激射出淬毒暗箭！\n'];

  for (const p of Object.values(state.players)) {
    if (p.hp <= 0) continue;

    if (p.role === 'archer' && Math.random() < CLASSES.archer.dodgeRate) {
      log.push(`🪶 弓箭手 **${p.user.username}** 憑藉超凡敏捷側身翻滾，無傷避開了陷阱！`);
      continue;
    }

    const trapDmg = 18;
    p.hp -= trapDmg;
    if (p.hp <= 0) {
      p.hp = 0;
      log.push(`💥 **${p.user.username}** 受到 **${trapDmg}** 點陷阱重創，不幸身亡！💀`);
    } else {
      log.push(`💢 **${p.user.username}** 受到 **${trapDmg}** 點陷阱傷害！（${generateHpBar(p.hp, p.maxHp, 8)} ${p.hp}/${p.maxHp}）`);
    }
  }

  const trapEmbed = new EmbedBuilder()
    .setTitle(`⚠️【第 ${state.floor} 層】致命陷阱！`)
    .setDescription(log.join('\n'))
    .setColor(0xEF4444);

  await state.channel?.send({ embeds: [trapEmbed] });
  setTimeout(() => advanceToNextFloorOrCheckpoint(state), 3500);
}

async function handleBattleEvent(state) {
  const baseMonster = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
  
  const playerCount = state.memberIds.length;
  const hpPlayerMultiplier = 1 + (playerCount - 1) * 0.25;
  const atkPlayerMultiplier = 1 + (playerCount - 1) * 0.5;

  const floorMultiplier = 1 + (state.floor - 1) * 0.05;

  const scaledHp = Math.floor(baseMonster.hp * hpPlayerMultiplier * floorMultiplier);
  const scaledAtk = Math.max(5, Math.floor(baseMonster.attack * atkPlayerMultiplier * floorMultiplier));

  state.currentMonster = {
    name: baseMonster.name,
    desc: baseMonster.desc,
    attack: scaledAtk,
    hp: scaledHp,
    maxHp: scaledHp,
    baseHp: baseMonster.hp,
    resistance: baseMonster.resistance,
    ultName: baseMonster.ultName
  };

  state.battleRound = 1;
  state.warriorShieldTurn = 0;
  
  for (const p of Object.values(state.players)) {
    p.bleedTurns = 0;
    p.stunnedNextTurn = false;
  }

  await executeTurn(state);
}

async function executeTurn(state) {
  state.channel = await getSafeChannel(state.channelId, state.channel);

  const alivePlayers = Object.values(state.players).filter(p => p.hp > 0);
  if (alivePlayers.length === 0) {
    activeGames.delete(state.channelId);
    return state.channel?.send('💀 **全軍覆沒！** 小隊全員倒下。');
  }

  state.state = 'IN_BATTLE';
  for (const p of Object.values(state.players)) {
    p.action = null;
    p.targetPlayerId = null;
    p.isStealthed = false;
  }

  const monster = state.currentMonster;
  const monsterHpBar = generateHpBar(monster.hp, monster.maxHp, 15);
  
  const teamStatus = Object.values(state.players).map(p => {
    const hpBar = generateHpBar(p.hp, p.maxHp, 10);
    const equips = formatPlayerEquips(p);
    let statusText = '';
    if (p.hp <= 0) {
      statusText = `🪦 已陣亡`;
    } else {
      const bleedTag = p.bleedTurns > 0 ? ` (🩸撕裂x${p.bleedTurns})` : '';
      const stunTag = p.stunnedNextTurn ? ` (💫脫力)` : '';
      statusText = `\n> ${hpBar} ❤️ ${p.hp}/${p.maxHp}${bleedTag}${stunTag}`;
    }
    return `${CLASSES[p.role].emoji} **${p.user.username}**：${equips}${statusText}`;
  }).join('\n');

  let buffNote = '';
  if (state.warriorShieldTurn === 1) {
    buffNote += '\n🛡️ **戰士護盾生效中 (第2回合)**：本回合全隊將阻擋 40% 傷害！';
  }
  if (monster.baseHp < 100) {
    const bleedDmg = Math.floor(2 * (1 + (state.floor - 1) * 0.05));
    buffNote += `\n🩸 **【敏捷嗜血特性】**：受傷者每回合初將持續承受 ${bleedDmg} 點撕裂傷害（持續2回合）！`;
  }

  let resText = '⚪ 無特殊抗性';
  if (monster.resistance === 'phys') resText = '🛡️ **【高階物理抗性】（受到物理傷害降低 70%！）**';
  if (monster.resistance === 'mag') resText = '🔮 **【高階魔法抗性】（受到魔法傷害降低 70%！）**';

  const isUltTurn = (state.battleRound % 3 === 0);
  const ultWarning = isUltTurn ? `\n⚠️ **【警告：BOSS 正在蓄力必殺技【${monster.ultName}】(1.35倍傷害)！】**` : '';

  const battleEmbed = new EmbedBuilder()
    .setTitle(`⚔️【第 ${state.floor} 層 - 第 ${state.battleRound} 回合】魔物阻截：${monster.name}`)
    .setDescription(
      `${monster.desc}\n\n` +
      `🛡️ **防禦特性**：${resText}\n` +
      `👾 **怪物生命**：\n> ${monsterHpBar} **${monster.hp}** / ${monster.maxHp}\n` +
      `⚔️ **反擊威脅**：**${isUltTurn ? Math.floor(monster.attack * 1.35) : monster.attack}** 點${ultWarning}${buffNote}\n\n` +
      `📋 **小隊現狀**：\n${teamStatus}\n\n` +
      `⏱️ **請在 30 秒內點擊下方按鈕指定行動（或直接跳過）！**`
    )
    .setColor(isUltTurn ? 0x991B1B : 0xDC2626);

  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_open_skills').setLabel('📜 展開我的專屬技能').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_skip_turn').setLabel('⏭️ 跳過回合 (不行動)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_quit').setLabel('🏳️ 放棄冒險').setStyle(ButtonStyle.Danger)
  );

  await state.channel?.send({ embeds: [battleEmbed], components: [mainRow] });

  state.turnTimer = setTimeout(() => {
    if (state.state === 'IN_BATTLE') {
      resolveTurnActions(state);
    }
  }, 30000);
}

// 結算行動
async function resolveTurnActions(state) {
  state.channel = await getSafeChannel(state.channelId, state.channel);
  const monster = state.currentMonster;
  const log = [];
  
  let bardDmgMultiplier = 1.0;
  let bardDmgReduction = 1.0;
  let monsterAttackReduction = 0;
  let assassinDidCrit = false;
  let bardBuffActive = false;

  // 0. 特性觸發：基礎血量 < 100 的怪物在回合開始造成撕裂傷害
  if (monster.baseHp < 100) {
    const bleedDmg = Math.floor(2 * (1 + (state.floor - 1) * 0.05));
    for (const p of Object.values(state.players)) {
      if (p.hp > 0 && p.bleedTurns > 0) {
        p.hp -= bleedDmg;
        p.bleedTurns -= 1;
        if (p.hp <= 0) {
          p.hp = 0;
          log.push(`🩸 **${p.user.username}** 傷口惡化承受 **${bleedDmg}** 點撕裂傷害，傷重倒地！💀`);
        } else {
          log.push(`🩸 **${p.user.username}** 傷口持續撕裂，受到 **${bleedDmg}** 點額外傷害！（剩餘流血: ${p.bleedTurns} 回合）`);
        }
      }
    }
  }

  // 1. 詩人增傷 50%，受傷降低 25%，使敵方雙抗降至 65%
  for (const p of Object.values(state.players)) {
    if (p.hp > 0 && !p.stunnedNextTurn && p.action === 'b_buff') {
      bardDmgMultiplier = 1.5;
      bardDmgReduction = 0.75;
      bardBuffActive = true;
      log.push(`🪕 **${p.user.username}** 奏響【狂熱協奏】！全隊本回合造成的傷害提高 50%、承受傷害降低 25%，並削弱怪物抗性至 65%！`);
    }
  }

  function applyResistanceDamage(rawDmg, dmgType) {
    let finalDmg = rawDmg;
    let isResisted = false;
    const resistRate = bardBuffActive ? 0.65 : 0.70;
    const penetrationMultiplier = 1 - resistRate;

    if (monster.resistance === 'phys' && dmgType === 'phys') {
      finalDmg = Math.floor(finalDmg * penetrationMultiplier);
      isResisted = true;
    } else if (monster.resistance === 'mag' && dmgType === 'mag') {
      finalDmg = Math.floor(finalDmg * penetrationMultiplier);
      isResisted = true;
    }
    return { dmg: Math.max(1, finalDmg), isResisted, resistPercent: Math.round(resistRate * 100) };
  }

  // 2. 玩家行動結算
  for (const p of Object.values(state.players)) {
    if (p.stunnedNextTurn) {
      log.push(`💫 **${p.user.username}** 處於脫力虛脫狀態，本回合無法行動，正在努力調整呼吸！`);
      continue;
    }

    if (p.hp <= 0) continue;

    if (p.action === 'skip') {
      log.push(`⏭️ **${p.user.username}** 選擇了保留實力，跳過了本回合行動！`);
      continue;
    }

    if (!p.action) {
      log.push(`⏳ **${p.user.username}** (${CLASSES[p.role].name}) 猶豫不決，本回合發呆！`);
      continue;
    }

    switch (p.action) {
      case 'basic': {
        const dmgType = (p.role === 'mage' || p.role === 'bard') ? 'mag' : 'phys';
        const raw = Math.floor((10 + p.bonusAtk) * bardDmgMultiplier);
        const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, dmgType);
        monster.hp -= dmg;
        const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
        const typeNote = dmgType === 'mag' ? '【魔法】' : '【物理】';
        log.push(`🗡️ **${p.user.username}** 施展${typeNote}【普通攻擊】，對怪物造成 **${dmg}** 點傷害！${resNote}`);
        if (p.role === 'assassin' && p.cannotCrit) p.cannotCrit = false;
        break;
      }
      case 'w_strike': {
        const raw = Math.floor((15 + p.bonusAtk) * bardDmgMultiplier);
        const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
        monster.hp -= dmg;
        const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';
        log.push(`🛡️ **${p.user.username}** 揮動巨劍斬擊，對怪物造成 **${dmg}** 點【物理】傷害！${resNote}`);
        break;
      }
      case 'w_shield': {
        state.warriorShieldTurn = 1;
        log.push(`🛡️ **${p.user.username}** 築起【壁壘守護】！本回合全隊將阻擋 90% 的傷害！`);
        break;
      }
      case 'm_blast': {
        const raw = Math.floor((40 + p.bonusAtk) * bardDmgMultiplier);
        const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
        monster.hp -= dmg;
        const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
        log.push(`🧙‍♂️ **${p.user.username}** 引爆【奧術爆破】，轟出 **${dmg}** 點【魔法】傷害！${resNote}`);
        break;
      }
      case 'm_drain': {
        const rawBase = Math.floor(Math.random() * 6) + 15;
        const raw = Math.floor((rawBase + p.bonusAtk) * bardDmgMultiplier);
        const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
        monster.hp -= dmg;
        const healAmt = Math.max(1, Math.round(dmg * 0.2));
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
        log.push(`🩸 **${p.user.username}** 施展【生命汲取】，造成 **${dmg}** 點【魔法】傷害${resNote}，並吸取其 20%（恢復了 **${healAmt}** 點生命）！`);
        break;
      }
      case 'a_shot': {
        const raw = Math.floor((30 + p.bonusAtk) * bardDmgMultiplier);
        const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
        monster.hp -= dmg;
        const resNote = isResisted ? ` (🛡️️抗性減免${resistPercent}%)` : '';
        log.push(`🏹 **${p.user.username}** 射出精準箭矢，造成 **${dmg}** 點【物理】傷害！${resNote}`);
        break;
      }
      case 'a_rain': {
        monsterAttackReduction += 10;
        const raw = Math.floor((20 + p.bonusAtk) * bardDmgMultiplier);
        const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'mag');
        monster.hp -= dmg;
        const resNote = isResisted ? ` (🔮抗性減免${resistPercent}%)` : '';
        log.push(`🏹 **${p.user.username}** 召喚【箭雨壓制】，造成 **${dmg}** 點【魔法】傷害${resNote}並削弱怪物 10 點攻擊！`);
        break;
      }
      case 's_stab': {
        let isCrit = false;
        if (p.cannotCrit) {
          isCrit = false;
          p.cannotCrit = false;
          log.push(`⚠️ 刺客 **${p.user.username}** 剛從陰影現身立足未穩，本次刺殺無法暴擊！`);
        } else {
          isCrit = Math.random() < CLASSES.assassin.critRate;
        }

        const base = 30 + p.bonusAtk;
        const finalBase = isCrit ? base * 2 : base;
        const raw = Math.floor(finalBase * bardDmgMultiplier);
        const { dmg, isResisted, resistPercent } = applyResistanceDamage(raw, 'phys');
        monster.hp -= dmg;
        const resNote = isResisted ? ` (🛡️抗性減免${resistPercent}%)` : '';

        if (isCrit) {
          assassinDidCrit = true;
          log.push(`💥 **${p.user.username}** 觸發致命暴擊！造成 **${dmg}** 點【物理】打擊！${resNote} (⚡ 觸發特性：【暗影刺殺】無冷卻！)`);
        } else {
          log.push(`🗡️ **${p.user.username}** 發動暗影刺殺，造成 **${dmg}** 點【物理】傷害！${resNote}`);
        }
        break;
      }
      case 's_smoke': {
        p.isStealthed = true;
        p.cannotCrit = true;
        log.push(`💨 **${p.user.username}** 擲出煙霧彈隱入暗影，本回合避開所有攻擊！（⚠️ 下次攻擊將無法暴擊）`);
        break;
      }
      case 'b_heal': {
        const groupHealAmt = 20 + (p.bardHealGroupBonus || 0);
        const singleHealAmt = 25 + (p.bardHealSingleBonus || 0);

        for (const ally of Object.values(state.players)) {
          if (ally.hp > 0) ally.hp = Math.min(ally.maxHp, ally.hp + groupHealAmt);
        }

        const targetAlly = state.players[p.targetPlayerId] || p;
        if (targetAlly && targetAlly.hp > 0) {
          targetAlly.hp = Math.min(targetAlly.maxHp, targetAlly.hp + singleHealAmt);
          log.push(`🪕 **${p.user.username}** 奏響【治癒頌歌】！全體隊友回復 **${groupHealAmt}** HP，並專注為 **${targetAlly.user.username}** 額外回復了 **${singleHealAmt}** HP！`);
        } else {
          log.push(`🪕 **${p.user.username}** 奏響【治癒頌歌】！全體存活隊友回復了 **${groupHealAmt}** 點生命值！`);
        }
        break;
      }
      case 'b_buff':
        break;

      case 'b_revive': {
        const revivedPlayer = state.players[p.targetPlayerId];
        if (revivedPlayer) {
          revivedPlayer.hp = Math.max(1, Math.floor(revivedPlayer.maxHp * 0.35));
          p.nextTurnStunFlag = true;
          revivedPlayer.nextTurnStunFlag = true;
          log.push(`🕊️✨ **${p.user.username}** 唱響了神聖奇蹟【甦生之歌】！將倒下的 **${revivedPlayer.user.username}** 喚醒歸隊（恢復了 **${revivedPlayer.hp}** 點生命）！\n*(⚠️ 代價生效：下一回合兩人都將脫力無法行動！)*`);
        }
        break;
      }
    }
  }

  // 3. 處理脫力狀態
  for (const p of Object.values(state.players)) {
    if (p.stunnedNextTurn) {
      p.stunnedNextTurn = false;
    }
    if (p.nextTurnStunFlag) {
      p.stunnedNextTurn = true;
      p.nextTurnStunFlag = false;
    }
  }

  // 4. 冷卻時間處理
  for (const p of Object.values(state.players)) {
    if (p.hp <= 0) continue;
    const roleConfig = CLASSES[p.role];

    for (const skill of roleConfig.skills) {
      if (p.action === skill.id) continue;
      if (p.cooldowns[skill.id] > 0) {
        p.cooldowns[skill.id] -= 1;
      }
    }

    if (p.action && p.action !== 'skip') {
      const usedSkill = roleConfig.skills.find(s => s.id === p.action);
      if (usedSkill && usedSkill.cd > 0) {
        if (p.role === 'assassin' && p.action === 's_stab' && assassinDidCrit) {
          p.cooldowns['s_stab'] = 0;
        } else {
          p.cooldowns[usedSkill.id] = usedSkill.cd;
        }
      }
    }
  }

  // 5. 判定怪物擊殺（戰鬥勝利結算：技能 CD 全部刷新歸零）
  if (monster.hp <= 0) {
    monster.hp = 0;
    log.push(`\n🎉 **${monster.name} 倒下了！小隊成功突破第 ${state.floor} 層！**`);
    
    for (const p of Object.values(state.players)) {
      p.stunnedNextTurn = false;
      p.bleedTurns = 0;
      
      // 戰鬥結束後直接刷新全角色所有技能 CD
      if (p.cooldowns) {
        for (const skillId of Object.keys(p.cooldowns)) {
          p.cooldowns[skillId] = 0;
        }
      }

      // 暗中提升詩人1技能數值
      if (p.role === 'bard') {
        p.bardHealGroupBonus = (p.bardHealGroupBonus || 0) + 2;
        p.bardHealSingleBonus = (p.bardHealSingleBonus || 0) + 2;
      }
    }

    const growthLog = [];
    for (const p of Object.values(state.players)) {
      if (p.hp > 0) {
        p.maxHp += 10;
        p.bonusAtk += 5;
        const healAmt = Math.max(1, Math.round(p.maxHp * 0.2));
        p.hp = Math.min(p.maxHp, p.hp + 10 + healAmt);
        growthLog.push(`• <@${p.user.id}> HP上限 **+10**、攻擊力 **+5**，並恢復了 **${healAmt}** 生命（${p.hp}/${p.maxHp}）`);
      }
    }

    const activeRoles = Object.values(state.players).map(p => p.role);
    const eligibleLoots = LOOT_TABLE.filter(l => activeRoles.includes(l.role));
    const drop = eligibleLoots[Math.floor(Math.random() * eligibleLoots.length)];

    let equipOwner = null;
    for (const p of Object.values(state.players)) {
      if (p.role === drop.role) {
        equipOwner = p;
        equipItemToPlayer(p, drop);
        break;
      }
    }

    const winEmbed = new EmbedBuilder()
      .setTitle(`🏆 第 ${state.floor} 層戰鬥勝利！`)
      .setDescription(
        log.join('\n') + '\n\n' +
        `💪 **【戰鬥歷練成長】全體存活角色獲得體魄躍升（技能冷卻已完全重置）：**\n` +
        growthLog.join('\n') + '\n\n' +
        `🎁 **【戰利品掉落】獲得裝備：【${drop.name}】** (當前持有: x${equipOwner.equipCounts[drop.name]})\n` +
        `• 適合職業：**${CLASSES[drop.role].emoji} ${CLASSES[drop.role].name}**\n` +
        `• 裝備效果：**${drop.desc}**（數值已直接疊加！）\n` +
        `• 穿戴者：<@${equipOwner.user.id}> 立即裝備上了此道具！`
      )
      .setColor(0x10B981);

    await sendToChannel(state.channelId, { embeds: [winEmbed] });
    return setTimeout(() => advanceToNextFloorOrCheckpoint(state), 3500);
  }

  // 6. 怪物反擊結算
  const isUltTurn = (state.battleRound % 3 === 0);
  let baseDamageCalc = monster.attack;

  if (isUltTurn) {
    baseDamageCalc = Math.floor(baseDamageCalc * 1.35);
    log.push(`\n🔥 **${monster.name} 釋放了必殺技【${monster.ultName}】！**`);
  } else {
    log.push(`\n👾 **${monster.name} 發動了反擊！**`);
  }

  const effectiveBaseAtk = Math.max(5, baseDamageCalc - monsterAttackReduction);

  const aoeDmgRaw = Math.max(1, Math.floor(effectiveBaseAtk * 0.5));
  const scatterDmgPool = Math.max(1, effectiveBaseAtk - aoeDmgRaw);

  let shieldDamageMod = 1.0;
  if (state.warriorShieldTurn === 1) {
    shieldDamageMod = 0.1;
    log.push(`🛡️️ **【壁壘守護】本回合為全隊阻擋了 90% 的衝擊！**`);
    state.warriorShieldTurn = 2;
  } else if (state.warriorShieldTurn === 2) {
    shieldDamageMod = 0.6;
    log.push(`🛡️ **【壁壘守護】餘威為全隊阻擋了 40% 的傷害！**`);
    state.warriorShieldTurn = 0;
  }

  function calculateDamageToPlayer(player, rawDamage) {
    let finalDmg = rawDamage;
    if (player.role === 'assassin') finalDmg = Math.floor(finalDmg * CLASSES.assassin.vulnerableMod);
    if (shieldDamageMod < 1.0) finalDmg = Math.max(1, Math.floor(finalDmg * shieldDamageMod));
    if (bardDmgReduction < 1.0) finalDmg = Math.floor(finalDmg * bardDmgReduction);
    return Math.max(1, finalDmg);
  }

  const livingPlayers = Object.values(state.players).filter(p => p.hp > 0);
  const playerRawScatter = {};
  livingPlayers.forEach(p => { playerRawScatter[p.user.id] = 0; });

  let remainingDmg = scatterDmgPool;
  while (remainingDmg > 0 && livingPlayers.length > 0) {
    const randomTarget = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
    const stepDmg = Math.min(remainingDmg, Math.floor(Math.random() * 4) + 2);
    playerRawScatter[randomTarget.user.id] += stepDmg;
    remainingDmg -= stepDmg;
  }

  for (const p of Object.values(state.players)) {
    if (p.hp <= 0) continue;

    if (p.isStealthed) {
      log.push(`💨 **${p.user.username}** 處於匿蹤狀態，避開了所有反擊！`);
      continue;
    }

    if (p.role === 'archer' && Math.random() < CLASSES.archer.dodgeRate) {
      log.push(`🪶 弓箭手 **${p.user.username}** 身手矯健，閃避了所有反擊！`);
      continue;
    }

    const totalRawAssigned = aoeDmgRaw + (playerRawScatter[p.user.id] || 0);
    const totalTakenDmg = calculateDamageToPlayer(p, totalRawAssigned);

    p.hp -= totalTakenDmg;

    if (totalTakenDmg > 0 && monster.baseHp < 100) {
      p.bleedTurns = 2;
    }

    if (p.hp <= 0) {
      p.hp = 0;
      p.bleedTurns = 0;
      log.push(`💥 **${p.user.username}** 受到 **${totalTakenDmg}** 點傷害，倒地陣亡！💀`);
    } else {
      log.push(`💢 **${p.user.username}** 受到 **${totalTakenDmg}** 點傷害（${generateHpBar(p.hp, p.maxHp, 8)} ${p.hp}/${p.maxHp}）`);
    }
  }

  state.battleRound += 1;

  const settleEmbed = new EmbedBuilder()
    .setTitle(`第 ${state.floor} 層 - 回合結算`)
    .setDescription(log.join('\n'))
    .setColor(0xF59E0B);

  await sendToChannel(state.channelId, { embeds: [settleEmbed] });
  setTimeout(() => executeTurn(state), 4500);
}

client.login(process.env.DISCORD_TOKEN);