# VAEM - Asset manager

A tool for encoding and managing video assets 

## Getting Started

Start the mongo and memcached services using Docker compose:
```bash
docker-compose up -d
```

Then start the development server using yarn:
```bash
yarn
yarn dev
```

## Deployment

When hosting behind an Nginx proxy, make sure that the timeout and buffer settings do not break proper operation:

```
proxy_connect_timeout       30000;
proxy_send_timeout          30000;
proxy_read_timeout          30000;
send_timeout                30000;

proxy_request_buffering off;
proxy_buffering off;
```

## Built With

* [FFMPEG](http://ffmpeg.org/) - Used for video conversion
* [SubtitleEdit](https://www.nikse.dk/subtitleedit) - Used for subtitle conversion

## Contributing

Please read [CONTRIBUTING.md](https://gist.github.com/PurpleBooth/b24679402957c63ec426) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your/project/tags). 

## Authors

* **Wouter van de Molengraft** - *Initial work*

## License

This project is licensed under the GPLv3 License - see [LICENSE.txt](LICENSE.txt) file for details
