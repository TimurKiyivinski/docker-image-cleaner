'use strict'

const fs = require('fs')
const exec = require('child_process').exec
const schedule = require('node-schedule')
const Docker = require('dockerode')

const env = JSON.parse(fs.readFileSync('env.json', 'utf8'))

;(function () {
  const cleanImages = () => {
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
          port: env.port,
          protocol: env.protocol || 'http',
          ca: env.ca ? fs.readFileSync(env.ca) : undefined,
          cert: env.cert ? fs.readFileSync(env.cert) : undefined,
          key: env.key ? fs.readFileSync(env.key) : undefined
        })
      }
    }

    // Create Docker connection
    const docker = createDockerConnection()

    // Docker Image handler
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
        // Default use-case handling
        const generalRemoveImages = images
          // Remap images with no RepoTag
          .map(image => image.RepoTags === null
            ? Object.assign({}, image, { RepoTags: ['<none>:<none>']})
            : image)
          // Clear untagged use-case
          .map(image => env.clearUntagged && image.RepoTags.indexOf('<none>:<none>') > -1
            ? Object.assign({ delete: true, reason: 'image is untagged' }, image)
            : image)
          .filter(image => image.delete)

        // Image specific use-cases handlers
        const manageImages = env.images.map(image => image.name)

        const processedImages = images
          // Remap images with no RepoTag
          .map(image => image.RepoTags === null
            ? Object.assign({}, image, { RepoTags: ['<none>:<none>']})
            : image)
          // Filter for images in manageImages
          .filter(image => image.RepoTags
              .filter(repository => manageImages.indexOf(repository.split(':')[0]) > -1).length > 0)
          // Merge filtered images with env configuration
          .map(image => Object.assign({}, env.images.filter(envImage => envImage.name === manageImages[manageImages.indexOf(image.RepoTags[0].split(':')[0])])[0], image))
          // Pipe images through each use case
          .map(image => image.onlyLatest && image.RepoTags.indexOf(`${image.name}:latest`) == -1
            ? Object.assign({ delete: true, reason: 'image is not latest'}, image)
            : image)
          .map(image => image.removePrefix && image.RepoTags.filter(repository => repository.indexOf(`${image.name}:${image.removePrefix}`) > -1).length > 0
            ? Object.assign({ delete: true, reason: `image has tag prefix of ${image.removePrefix}.`}, image)
            : image)
          .map(image => image.removePostfix && image.filter(repository => repository.endsWith(image.removePostfix)).length > 0
            ? Object.assign({ delete: true, reason: `image has tag postfix of ${image.removePostfix}.`}, image)
            : image)

        // Manage images with keep keys after processing
        const keepRemoveImages = manageImages
          // Group images by repository
          .map(manageImage => ({
            images: processedImages
              .filter(image => !image.delete && image.keep && image.name === manageImage)
              .sort((a, b) => b.Created - a.Created)
              .map(image => Object.assign({ reason: 'image is outdated.' }, image))
          }))
          .filter(keepImage => keepImage.images.length > 0)
          .filter(keepImage => keepImage.images.length > keepImage.images[0].keep)
          // Remove older images based on keep treshold
          .map(keepImage => ({ 'images': keepImage.images.slice(keepImage.images[0].keep) }))
          .map(removeImage => removeImage.images)

        // Combine all image arrays and begin deleting
        processedImages.filter(image => image.delete)
          .concat(generalRemoveImages)
          .concat(...keepRemoveImages)
          .map(image => {
            const dockerImage = docker.getImage(image.Id)
            dockerImage.remove(err => {
              if (!err) {
                console.log(`[DELETE] ${image.Id} because ${image.reason}`)
              } else {
                console.log(`[ERROR] [DELETE] ${image.Id} because ${err}`)
              }
            })
          })
      } else {
        console.log(`[ERR] Docker daemon error with ${err}`)
      }
    })

    // Docker Container Handler
    docker.listContainers({ all: true }, (err, containers) => {
      if (!err) {
        const processedContainers = containers
          .map(container => env.clearExited && container.State === 'exited'
            ? Object.assign({ delete: true, reason: 'container has exited.' }, container)
            : container)

        // Delete processed containers
        processedContainers.filter(container => container.delete)
          .map(container => {
            const dockerContainer = docker.getContainer(container.Id)
            dockerContainer.remove(err => {
              if (!err) {
                console.log(`[DELETE] ${container.Id} because ${container.reason}`)
              } else {
                console.log(`[ERROR] [DELETE] ${container.Id} because ${err}`)
              }
            })
          })
      } else {
        console.log(`[ERR] Docker daemon error with ${err}`)
      }
    })
  }

  if (env.cron) {
    schedule.scheduleJob(env.cron, cleanImages)
  } else {
    cleanImages()
  }
})()
