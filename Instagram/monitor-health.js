const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");

class HealthMonitor {
  constructor() {
    this.healthUrl = process.env.HEALTH_URL || "http://localhost:3000/health";
    this.checkInterval = 2 * 60 * 1000; // 2 minutes
    this.maxConsecutiveFailures = 3;
    this.consecutiveFailures = 0;
    this.lastRestart = 0;
    this.restartCooldown = 5 * 60 * 1000; // 5 minutes
    this.logFile = "health-monitor.log";
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(this.logFile, logMessage + "\n");
  }

  async checkHealth() {
    try {
      const response = await axios.get(this.healthUrl, {
        timeout: 30000,
        headers: {
          "User-Agent": "HealthMonitor/1.0",
        },
      });

      const health = response.data;
      this.consecutiveFailures = 0;

      // Check various health indicators
      const issues = [];

      if (health.status === "unhealthy") {
        issues.push("Service marked as unhealthy");
      }

      if (health.status === "warning") {
        issues.push(health.memoryWarning || "Warning status detected");
      }

      if (health.circuitBreaker?.state === "OPEN") {
        issues.push("Circuit breaker is open");
      }

      if (health.browserPool?.total > 3) {
        issues.push("Too many browser instances");
      }

      if (health.memory?.heapUsed > 800 * 1024 * 1024) {
        // 800MB
        issues.push("Memory usage too high");
      }

      if (health.consecutiveFailures > 2) {
        issues.push("Too many consecutive failures");
      }

      if (issues.length > 0) {
        this.log(`⚠️ Health issues detected: ${issues.join(", ")}`);
        await this.considerRestart();
      } else {
        this.log("✅ Health check passed");
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.log(
        `❌ Health check failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${error.message}`
      );

      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        await this.restartService();
      }
    }
  }

  async considerRestart() {
    const now = Date.now();
    if (now - this.lastRestart < this.restartCooldown) {
      this.log("⏳ Restart cooldown active, skipping restart");
      return;
    }

    this.log("🔄 Initiating service restart...");
    await this.restartService();
  }

  async restartService() {
    const now = Date.now();
    this.lastRestart = now;
    this.consecutiveFailures = 0;

    this.log("🔄 Restarting service...");

    // Kill existing process
    exec('pkill -f "node index.js"', (error) => {
      if (error) {
        this.log(`⚠️ Error killing process: ${error.message}`);
      } else {
        this.log("✅ Killed existing process");
      }

      // Wait a moment then restart
      setTimeout(() => {
        exec("npm start", { cwd: __dirname }, (error, stdout, stderr) => {
          if (error) {
            this.log(`❌ Failed to restart service: ${error.message}`);
          } else {
            this.log("✅ Service restarted successfully");
          }
        });
      }, 5000);
    });
  }

  start() {
    this.log("🚀 Health monitor started");
    this.log(`📊 Monitoring: ${this.healthUrl}`);
    this.log(`⏰ Check interval: ${this.checkInterval / 1000 / 60} minutes`);

    // Initial check
    this.checkHealth();

    // Schedule regular checks
    setInterval(() => {
      this.checkHealth();
    }, this.checkInterval);

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      this.log("🛑 Health monitor shutting down...");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      this.log("🛑 Health monitor shutting down...");
      process.exit(0);
    });
  }
}

// Start the monitor
const monitor = new HealthMonitor();
monitor.start();
