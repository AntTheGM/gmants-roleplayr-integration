import { MODULE_ID } from "../const.js";

export const logger = {
  debug: (...args) => console.debug(`${MODULE_ID} |`, ...args),
  info: (...args) => console.log(`${MODULE_ID} |`, ...args),
  warn: (...args) => console.warn(`${MODULE_ID} |`, ...args),
  error: (...args) => console.error(`${MODULE_ID} |`, ...args),
};
