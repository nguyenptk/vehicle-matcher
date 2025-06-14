import fs from 'fs';
import axios from 'axios';

async function main() {
  const lines = fs.readFileSync('input.txt', 'utf-8').split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const { data } = await axios.post('http://localhost:3000/match', { description: line });
      console.log(`Input: ${line}`);
      console.log(`Vehicle ID: ${data.vehicleId}`);
      console.log(`Confidence: ${data.confidence}`);
      console.log('---');
    } catch (err: any) {
      console.error(`Error matching "${line}":`, err.message);
    }
  }
}

main();
