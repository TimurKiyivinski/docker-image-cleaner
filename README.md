# docker-image-cleaner
A generic application to remove Docker images

## usage
Copy `env.json.example` to `env.json` and run `npm start`.

## docker socket configuration
You can configure usage for either a local socket via `socketPath` or a Docker
remote API via the `host` and `port` options. If `socketPath` exists, the
application will ignore other options. More configuration details available at
the [dockerode](https://github.com/apocas/dockerode) GitHub page.
```JSON
{
    "socketPath": "/var/run/docker.sock",
    "host": "127.0.0.1",
    "port": 5000,
    "protocol": "http",
    "ca": "ca.pem",
    "cert": "cert.pem",
    "key": "key.pem"
}
```

## general use-cases
General use cases are tested against all images and are on the same level as
other options.

### clear untagged images
Set the key `clearUntagged` as `true`.

## image specific use-cases
Each image use-case has to be appended to the `images` key as part of an array
in the `env.json`. Set the image repository name under the key `name`.

### only keep latest image
Set `onlyLatest` as `true` under the image configuration. This use-case is
incompatible and cannot be used with other image-specific use-cases.

### remove images with specific prefix
This option is useful for continuous integration environment where test images
may have a `test_` prefix for example. Set the `removePrefix` key on the image
with the value of the prefix string.

### remove images with specific postfix/suffix
Similar to the `removePrefix` option, may be handy for continuous integration.
Set the `removePostfix` key on the image with the postfix string value.

### keep image count based on creation date
This can be useful for removing older images builds that may no longer be in
use. It can be used along with `removePrefix` and `removeSuffix` options. Set
the image `keep` key to a value of 2 or more.

## limitations
* all image repository prefixes are assumed to be the same
