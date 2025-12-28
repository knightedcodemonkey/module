const data = require('./data.json')
const { value, nested } = require('./data.json')
require('./data.json')

module.exports = {
  value: data.value,
  pick: { value, nested },
  side: 'ok',
}
