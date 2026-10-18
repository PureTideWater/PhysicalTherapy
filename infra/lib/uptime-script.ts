/**
 * The uptime and certificate checks' canary script (docs/adr/0049), as the inline source CloudWatch
 * Synthetics runs (CommonJS, Node.js; it uses only Node's https and tls modules). A run passes when
 * the handler resolves and fails when it throws. Each canary is configured by environment variables:
 *
 * - TP_HOST and TP_CHECK (JSON: method, path, status, and an optional JSON body): one HTTPS request
 *   to the application's host, which must answer exactly that status within ten seconds. The request
 *   carries the application's own Origin, as a browser's would. The response body is never read
 *   into a message.
 * - TP_CERTIFICATE_HOSTS (comma-separated) and TP_CERTIFICATE_MIN_DAYS: a TLS connection to each host,
 *   which must present a certificate the runtime trusts for that name and that is valid for at
 *   least that many more days.
 *
 * Failure messages name the host, the path and the status or the days left: no request or response
 * content, so nothing a page shows can reach a log line or an alarm.
 */
export const UPTIME_SCRIPT = `'use strict';
const https = require('node:https');
const tls = require('node:tls');
const TIMEOUT_MS = 10000;
const DAY_MS = 86400000;

function status(host, check) {
  return new Promise((resolve, reject) => {
    const body = check.body === undefined ? undefined : JSON.stringify(check.body);
    const headers = { origin: 'https://' + host, 'user-agent': 'tp-uptime-check' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(body));
    }
    const request = https.request({ host, servername: host, port: 443, method: check.method, path: check.path, headers, timeout: TIMEOUT_MS }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
      response.on('error', () => reject(new Error(check.method + ' https://' + host + check.path + ' broke off')));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => reject(new Error(check.method + ' https://' + host + check.path + ' failed: ' + (error.code || error.message))));
    request.end(body);
  });
}

function certificateDays(host, now) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, servername: host, port: 443, timeout: TIMEOUT_MS }, () => {
      const certificate = socket.getPeerCertificate();
      socket.end();
      const expires = certificate && certificate.valid_to ? Date.parse(certificate.valid_to) : NaN;
      if (Number.isNaN(expires)) {
        reject(new Error(host + ' presented no certificate'));
      } else {
        resolve(Math.floor((expires - now) / DAY_MS));
      }
    });
    socket.on('timeout', () => socket.destroy(new Error('timeout')));
    socket.on('error', (error) => reject(new Error('TLS to ' + host + ' failed: ' + (error.code || error.message))));
  });
}

exports.handler = async () => {
  const env = process.env;
  if (env.TP_CHECK) {
    const check = JSON.parse(env.TP_CHECK);
    const answered = await status(env.TP_HOST, check);
    if (answered !== check.status) {
      throw new Error(check.method + ' https://' + env.TP_HOST + check.path + ' answered ' + answered + ', expected ' + check.status);
    }
  }
  if (env.TP_CERTIFICATE_HOSTS) {
    const minimum = Number(env.TP_CERTIFICATE_MIN_DAYS);
    for (const host of env.TP_CERTIFICATE_HOSTS.split(',')) {
      const days = await certificateDays(host, Date.now());
      if (!(days >= minimum)) {
        throw new Error('the certificate of ' + host + ' expires in ' + days + ' days, under ' + minimum);
      }
    }
  }
  return 'passed';
};
`;
