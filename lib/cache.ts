import fs from "fs";
import path from "path";
import { Course } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface CacheEntry {
  timestamp: number;
  data: Course[];
}

interface CacheData {
  [dept: string]: CacheEntry;
}

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

const CACHE_FILE = path.join(CACHE_DIR, "departments.json");

// Initialize cache file if it doesn't exist
if (!fs.existsSync(CACHE_FILE)) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify({}));
}

export function getCachedData(dept: string): Course[] | null {
  try {
    const cache: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    const entry = cache[dept];
    
    if (!entry) return null;
    
    // Check if cache is expired (older than 24 hours)
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      return null;
    }
    
    return entry.data;
  } catch {
    return null;
  }
}

export function setCachedData(dept: string, data: Course[]): void {
  try {
    const cache: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    
    cache[dept] = {
      timestamp: Date.now(),
      data,
    };
    
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error("Failed to write to cache:", error);
  }
}
