const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

class ServiceMonitor {
  constructor() {
    this.services = {
      instagram: {
        name: "Instagram Service",
        healthUrl: "http://localhost:3000/health",
        port: 3000,
        restartCommand: "npm run start:ig",
      },
      snapchat: {
        name: "Snapchat Service",
        healthUrl: "http://localhost:8000/health",
        port: 8000,
        restartCommand: "npm run start:snap",
      },
      frontend: {
        name: "Unified Frontend",
        healthUrl: "http://localhost:5173",
        port: 5173,
        restartCommand: "npm run start:frontend",
      },
    };

    this.checkInterval = 2 * 60 * 1000; // 2 minutes
    this.maxFailures = 3;
    this.failureCounts = {};
    this.logFile = path.join(__dirname, "monitor-logs.txt");
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);

    // Append to log file
    fs.appendFileSync(this.logFile, logMessage + "\n");
  }

  async checkServiceHealth(serviceKey) {
    const service = this.services[serviceKey];

    try {
      const response = await axios.get(service.healthUrl, { timeout: 10000 });

      if (response.status === 200) {
        const health = response.data;
        this.log(
          `✅ ${service.name} is healthy - Uptime: ${Math.round(
            health.uptime / 60
          )} minutes`
        );

        // Reset failure count on success
        this.failureCounts[serviceKey] = 0;

        return true;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      this.failureCounts[serviceKey] =
        (this.failureCounts[serviceKey] || 0) + 1;
      this.log(
        `❌ ${service.name} health check failed (${this.failureCounts[serviceKey]}/${this.maxFailures}): ${error.message}`
      );

      if (this.failureCounts[serviceKey] >= this.maxFailures) {
        this.log(
          `🚨 ${service.name} has failed ${this.maxFailures} times, attempting restart...`
        );
        await this.restartService(serviceKey);
      }

      return false;
    }
  }

  async restartService(serviceKey) {
    const service = this.services[serviceKey];

    try {
      this.log(`🔄 Restarting ${service.name}...`);

      // Kill existing process on the port
      await this.killProcessOnPort(service.port);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Start the service
      exec(service.restartCommand, (error, stdout, stderr) => {
        if (error) {
          this.log(`❌ Failed to restart ${service.name}: ${error.message}`);
        } else {
          this.log(`✅ ${service.name} restart initiated`);
        }
      });

      // Reset failure count
      this.failureCounts[serviceKey] = 0;
    } catch (error) {
      this.log(`❌ Error restarting ${service.name}: ${error.message}`);
    }
  }

  async killProcessOnPort(port) {
    return new Promise((resolve) => {
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (stdout) {
          const lines = stdout.split("\n");
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 4) {
              const pid = parts[4];
              if (pid && pid !== "0") {
                exec(`taskkill /PID ${pid} /F`, (killError) => {
                  if (killError) {
                    this.log(
                      `⚠️ Could not kill process ${pid}: ${killError.message}`
                    );
                  } else {
                    this.log(`🔪 Killed process ${pid} on port ${port}`);
                  }
                });
              }
            }
          }
        }
        resolve();
      });
    });
  }

  async checkAllServices() {
    this.log("🔍 Starting health check cycle...");

    const promises = Object.keys(this.services).map((serviceKey) =>
      this.checkServiceHealth(serviceKey)
    );

    const results = await Promise.allSettled(promises);

    const healthyCount = results.filter(
      (result) => result.status === "fulfilled" && result.value === true
    ).length;

    this.log(
      `📊 Health check complete: ${healthyCount}/${
        Object.keys(this.services).length
      } services healthy`
    );
  }

  start() {
    this.log("🚀 Service monitor started");
    this.log(
      `📋 Monitoring services: ${Object.keys(this.services).join(", ")}`
    );
    this.log(`⏰ Check interval: ${this.checkInterval / 1000} seconds`);

    // Initial check
    this.checkAllServices();

    // Set up periodic checks
    setInterval(() => {
      this.checkAllServices();
    }, this.checkInterval);
  }

  async stop() {
    this.log("🛑 Service monitor stopped");
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Received SIGINT, shutting down monitor...");
  monitor.stop();
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down monitor...");
  monitor.stop();
});

// Start the monitor
const monitor = new ServiceMonitor();
monitor.start();
