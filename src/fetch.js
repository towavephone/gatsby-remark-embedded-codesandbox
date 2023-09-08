const fetch = require('node-fetch');

let activeRequests = 0; // 当前活动请求数量
const requestQueue = []; // 请求队列
let count = 0

function executeNextRequest() {
    // 取出下一个请求
    const { fetchParams, resolve, reject, retries } = requestQueue.shift();
  
    activeRequests++;
  
    const { maxRequestRetryCount, isLoggingRequest, nodeUrl } = fetchParams[1]
    fetch(...fetchParams)
      .then(async (response) => {
        // if (isLoggingRequest) {
        //   console.log('\n---------- fetch url ---------', nodeUrl)
        // }

        if (response.status !== 200) {
          const error = await response.text()
          throw new Error(error)
        }

        if (isLoggingRequest) {
          console.log('\nfetch success url', nodeUrl, ++count)
        }
        // 处理响应
        activeRequests--;
        const result = await response.json()
        resolve(result);
  
        // 执行下一个请求（如果还有）
        if (requestQueue.length > 0) {
          executeNextRequest();
        }
      })
      .catch(error => {
        if (retries < maxRequestRetryCount) {
          // if (isLoggingRequest) {
          //   console.log('\nfetch retry url', nodeUrl)
          // }
          // 重试请求
          requestQueue.push({ fetchParams, resolve, reject, retries: retries + 1 });
        } else {
          if (isLoggingRequest) {
            console.log('\nfetch error url', nodeUrl, ++count)
          }
          // 达到最大重试次数，标记请求为失败
          activeRequests--;
          reject(error);
        }
  
        // 执行下一个请求（如果还有）
        if (requestQueue.length > 0) {
          executeNextRequest();
        }
      });
  }
  

module.exports = function fetchData(...fetchParams) {
  const { maxRequestCount } = fetchParams[1]
  return new Promise((resolve, reject) => {
    // 将请求加入队列并设置重试次数
    requestQueue.push({ fetchParams, resolve, reject, retries: 0 });
    // 检查当前活动请求数量是否超过限制
    if (activeRequests < maxRequestCount) {
      executeNextRequest(); // 执行下一个请求
    }
  });
}