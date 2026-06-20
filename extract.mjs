import { createServer } from 'http';
import { writeFileSync } from 'fs';

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    if (body) {
      writeFileSync('extracted_levels.json', body);
      console.log('SUCCESS! Levels received and saved to extracted_levels.json');
      process.exit(0);
    }
    res.writeHead(200);
    res.end('OK');
  });
});
server.listen(9999, () => console.log('Listening on 9999...'));
