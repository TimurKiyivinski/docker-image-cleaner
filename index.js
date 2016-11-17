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
      // Default use-case handling
      const generalRemoveImages = images
        .map(image => {
          // Clear untagged use-case
          if (env.clearUntagged) {
            if (image.RepoTags.indexOf('<none>:<none>') > -1) {
              image.delete = true
              image.reason = 'image is untagged.'
            } else {
              image.delete = false
            }
          }
          return image
        })
        .filter(image => image.delete)

      // Special image handling
      const processedImages = images
        // Filter for images in manageImages
        .filter(image => image.RepoTags
            .filter(repository => manageImages.indexOf(repository.split(':')[0]) > -1).length > 0)
        // Merge filtered images with env configuration
        .map(image => {
          const mergedImage = {}
          // TODO: Document limitation of assuming all repository prefixes are the same
          const manageImageName = manageImages[manageImages.indexOf(image.RepoTags[0].split(':')[0])]
          const manageImage = env.images.filter(envImage => envImage.name === manageImageName)[0]

          Object.keys(manageImage).map(key => mergedImage[key] = manageImage[key])
          Object.keys(image).map(key => mergedImage[key] = image[key])

          return mergedImage
        })
        // Handle merged images
        .map(image => {
          // Handle keep latest image only use-case
          if (image.onlyLatest) {
            if (image.RepoTags.indexOf(`${image.name}:latest`) == -1) {
              image.delete = true
              image.reason = 'image is not latest.'
            } else {
              image.delete = false
            }
          }

          // Handle remove image with specific prefix tag
          if (image.removePrefix) {
            const matchedPrefixes = image.RepoTags.filter(repository => repository.indexOf(`${image.name}:${image.removePrefix}`) > -1)
            if (matchedPrefixes.length > 0) {
              image.delete = true
              image.reason = `image has tag prefix of ${image.removePrefix}.`
            } else {
              image.delete = false
            }
          }

          // Handle remove image with specific postfix tag
          if (image.removePostfix) {
            // TODO: Document the limitations of using postfixes
            const matchedPostfixes = image.RepoTags.filter(repository => repository.indexOf(image.removePostfix) > -1)
            if (matchedPostfixes.length > 0) {
              image.delete = true
              image.reason = `image has tag postfix of ${image.removePostfix}.`
            } else {
              image.delete = false
            }
          }

          // Return processed image
          return image
        })

      const keepRemoveImages = manageImages
        // Group images by repository
        .map(manageImage => {
          const imageKeepList = processedImages
            .filter(image => !image.delete && image.keep && image.name === manageImage)
            .sort((a, b) => b.Created - a.Created)
            .map(image => {
              image.reason = 'image is outdated.'
              return image
            })
          return { 'images': imageKeepList }
        })
        .filter(keepImage => keepImage.images.length > 0)
        .filter(keepImage => keepImage.images.length > keepImage.images[0].keep)
        // Remove older images based on keep treshold
        .map(keepImage => ({ 'images': keepImage.images.slice(keepImage.images[0].keep) }))
        .map(removeImage => removeImage.images)

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
    }
  })
})()
