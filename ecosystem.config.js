module.exports = {
  apps: [
    {
      name: "stitchopt-backend",
      script: "server.js",
      watch: ["controllers", "routes", "middleware", "utils", "server.js"],
      ignore_watch: ["node_modules", "logs", ".pids", "frontend", "uploads"],
      env: {
        NODE_ENV: "development",
        PORT: 5001
      }
    },
    {
      name: "stitchopt-frontend",
      script: "npm",
      args: "run dev",
      cwd: "./frontend",
      watch: false,
      env: {
        PORT: 3000
      }
    }
  ]
};
