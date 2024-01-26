const _ = require('lodash')
const fs = require('fs/promises')
const https = require('https')
const { Resolver } = require("dns");
const url = require('url');

const dnsServers = ['1.1.1.1', '8.8.8.8']
const resolver = new Resolver();


async function resolveDomain(domainName) {
  
  resolver.setServers(dnsServers);
  
  return new Promise((resolve) => {
    resolver.resolve4(domainName, (err, addresses) => {
      if (err) {
        console.error(`resolver error: ${err}`);
        return resolve([]);
      }
      return resolve(addresses);
    });
  });
}


const normalizeHauseDB = async(raw) => {
  const domains = new Set();
  const ips = new Set();
  const res = JSON.parse(raw)
  const ip_domain_map = {}
  const  items = _.toPairs(res).map(i => i[1][0].url)

  let x, item;
  for(x = 0; x < items.length; x++) {

    item = items[x];
    
    const parsedHost = url.parse(item).host.split(':')[0]
    if(/^(?!0)(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/.test(parsedHost)) {
      console.log("IP", parsedHost)
      ip_domain_map[parsedHost] = {url: item}
      ips.add(parsedHost)
    } else {
      if(!domains.has(parsedHost)) {
        domains.add(parsedHost)
        const resolvedIps =  await resolveDomain(parsedHost)
        resolvedIps.forEach(ip => {
          ips.add(ip)
          ip_domain_map[ip] = {domain: parsedHost, url: item}
        });
        console.log(`resolved ${parsedHost} to ${resolvedIps}`)
        
      } else {
        console.log(`Skipping DNS resolution for ${parsedHost} as it's previously been seen.`)
      }
    }
  }
  return {ips, domains, ip_domain_map}

}

const getUrlHausInfo = () => {
  
  return new Promise((resolve, reject) => {

  
    https.get('https://urlhaus.abuse.ch/downloads/json_online/', (res) => {
      const { statusCode } = res;
      const contentType = res.headers['content-type'];
    
      let error;
      
      if (statusCode !== 200) {
        error = new Error(`Status Code: ${statusCode}`);
          
      } else if (!/^application\/json/.test(contentType)) {
        error = new Error(`Invalid content-type: ${contentType}`);
      }
      if (error) {
        console.error(error.message);
        res.resume();
        return reject(error);
      }
    
      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', async() => {
        try {
          return resolve(normalizeHauseDB(rawData))
        } catch (e) {
          console.error(e.message);
          return reject(e)
        }
      });
    }).on('error', (e) => {
      console.error(e.message);
      return reject(e)
    });
  })
}


const buildFile = ({ips, ip_domain_map}) => {
  const _ips = Array.from(ips);
  let line, lines=[], url;
  _ips.forEach(ip => {
    url = ip_domain_map[ip].url
    line = `# url: ${url}`
    lines.push(line)
    lines.push(ip)

    console.log(line)
    console.log(ip)
  })
  return fs.writeFile(__dirname + '/../urlhaus.ipset', lines.join('\n'), {flag: 'w+'})
}


getUrlHausInfo().then(buildFile)

