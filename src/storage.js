const fs = require("fs/promises");
const path = require("path");

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async ensure() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch (_) {
      await fs.writeFile(this.filePath, JSON.stringify({}, null, 2), "utf8");
    }
  }

  async read() {
    await this.ensure();
    const raw = await fs.readFile(this.filePath, "utf8");
    return JSON.parse(raw || "{}");
  }

  async write(data) {
    await this.ensure();
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  async get(key) {
    const data = await this.read();
    return data[key];
  }

  async set(key, value) {
    const data = await this.read();
    data[key] = value;
    await this.write(data);
    return value;
  }
}

module.exports = { JsonStore };
