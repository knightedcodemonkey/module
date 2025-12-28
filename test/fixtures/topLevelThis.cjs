this.alpha = 1
exports.beta = this.alpha + 1
module.exports.self = this
module.exports.check = () => this === module.exports
