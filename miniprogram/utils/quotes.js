const QUOTES = [
  {
    cn: '一个人在疏于锻炼中老去，却从未见识过自己身体能够达到的力量与美，是一件可耻的事。',
    en: 'It is a disgrace to grow old through sheer carelessness before seeing what manner of man you may become by developing your bodily strength and beauty to their highest limit.',
    by: '苏格拉底'
  },
  {
    cn: '天赋不会给你刀刻般的肌肉。',
    en: 'Talent will not give you chiseled muscle.',
    by: ''
  },
  {
    cn: '生命所能给予的最好的奖赏，莫过于有机会为值得做的事情努力。',
    en: 'Far and away the best prize that life offers is the chance to work hard at work worth doing.',
    by: '西奥多·罗斯福'
  },
  {
    cn: '只要专注并热爱自己所做的事情，每个人都能够超越自身处境，取得成功。',
    en: 'Everyone can rise above their circumstances and achieve success if they are dedicated and passionate about what they do.',
    by: '纳尔逊·曼德拉'
  },
  {
    cn: '荣誉属于真正站在竞技场上的人——他的脸上沾满尘土、汗水和鲜血，他奋勇拼搏…',
    en: 'The credit belongs to the man who is actually in the arena, whose face is marred by dust and sweat and blood; who strives valiantly…',
    by: '西奥多·罗斯福'
  },
  {
    cn: '真正的训练，不是为了让身体变强，而是为了唤醒人的精神。',
    en: 'The exercises and toils of gymnastics are intended to stimulate the spirited element of our nature, not merely to increase strength.',
    by: '柏拉图'
  }
]

function pickDailyQuote(dateKey) {
  const key = String(dateKey || '')
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return QUOTES[hash % QUOTES.length]
}

module.exports = { QUOTES, pickDailyQuote }
