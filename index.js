const https = require('https');
const querystring = require('querystring');
const { createProbot } = require('probot');
const verify = require('@octokit/webhooks/verify');

const config = require('./config.json');

function addTask(content, project) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({ content: content, project_id: project });
    const options = {
      host: 'todoist.com',
      path: '/api/v7/items/add',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': body.length.toString(),
      },
    }

    const req = https.request(options, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('error', reject);
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });

    req.on('error', reject);

    req.write(body);
    req.end();
  });
}

function buildProbot() {
  const probot = createProbot({
    id: config.id,
    cert: config.cert,
    secret: config.secret,
  });
  probot.load(app => {
    app.on('issues.opened', async ctx => {
      const projectID = config.repos[ctx.payload.repository.full_name];
      if (!projectID) {
        console.error(`Unknown repository: ${ctx.payload.repository.full_name}`);
        return;
      }
      const result = addTask(`${ctx.payload.issue.title} ${ctx.payload.issue.html_url}`, projectID);
      if (result.status !== 200) {
        console.error(`Todoist returns status code ${result.status}`);
        console.error('Response: ' + JSON.stringify(result.body));
      }
    });
  });
  return probot;
}

exports.issue2todoist = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('OK\n');
    return;
  }

  const name = req.get('x-github-event');
  if (!name) {
    res.status(400).send('Header X-GitHub-Event is missing');
    return;
  }
  const id = req.get('x-github-delivery');
  if (!id) {
    res.status(400).send('Header X-GitHub-Delivery is missing');
    return;
  }
  const sig = req.get('x-hub-signature');
  if (!sig) {
    res.status(400).send('Header X-Hub-Signature is missing');
    return;
  }

  if (!verify(config.secret, req.body, sig)) {
    res.status(400).send('Invalid signature');
    return;
  }

  await buildProbot().receive({ name, id, payload: req.body });

  res.status(200).send('OK\n');
};
