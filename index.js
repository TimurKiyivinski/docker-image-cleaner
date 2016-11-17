'use strict'

const fs = require('fs')
const exec = require('child_process').exec
const Docker = require('dockerode')

const env = JSON.parse(fs.readFileSync('env.json', 'utf8'))

;(function () {
  const createDockerConnection = () => {
    if (env.socketPath) {
      console.log(`Creating Docker socket connection via ${env.socketPath}`)
      return new Docker({
        socketPath: env.socketPath
      })
    } else {
      console.log(`Connecting to Docker remote at ${env.host}:${env.port}`)
      return new Docker({
        host: env.host,
        port: env.port
      })
    }
  }

  // List of images to clean
  const manageImages = env.images.map(image => image.name)

  const docker = createDockerConnection()
  docker.listImages((err, images) => {
    /* Image data format
     * {
     *   Id: hash,
     *   ParentId: hash,
     *   RepoTags: [ repository:tag, ...],
     *   RepoDigests: [ repository:tag, ...] | null,
     *   Created: unixTime,
     *   Size: ...,
     *   VirtualSize: ...,
     *   Labels: { ... }
     * }
     */

    if (!err) {
      // Filter for images in manageImages
      images
        .filter(image => image.RepoTags
            .filter(repository => manageImages.indexOf(repository.split(':')[0]) > -1).length > 0)
        .map(image => {
          console.log(image)
        })
    }
  })
})()
