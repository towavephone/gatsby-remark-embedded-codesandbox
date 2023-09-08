const fetch = require('./fetch')

for (let i = 0; i < 100; i++) {
    fetch('https://baidu.com')
}