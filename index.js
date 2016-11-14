const exec = require('child_process').exec

;(function () {
  const command = 'docker images --format "{ \\"id\\": {{json .ID }}, \\"created_at\\": {{ json .CreatedAt }} }"'
  exec(command, { cwd: __dirname }, (err, stdout, stderr) => {
    if (!err) {
      const images = stdout
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => JSON.parse(line))

      console.log(images)
    }
  })
})()
