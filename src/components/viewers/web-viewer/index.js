module.exports = {
    template: require('web-viewer.html'),
    data: function() {
        return {
            showSpinner: false,
            iframeSource : ""
        }
    },
    props: ['context', 'file', 'currentDir'],
    created: function() {
        this.startListener();
        this.updateCurrentFileData();
    },
    methods: {
	startListener: function() {
	    var iframe = document.getElementById("web-viewer");
	    if (iframe == null) {
		    setTimeout(this.startListener, 500);
		    return;
	    }
	    // Listen for response messages from the frames.
	    window.addEventListener('message', function (e) {
		// Normally, you should verify that the origin of the message's sender
		// was the origin and source you expected. This is easily done for the
		// unsandboxed frame. The sandboxed frame, on the other hand is more
		// difficult. Sandboxed iframes which lack the 'allow-same-origin'
		// header have "null" rather than a valid origin. This means you still
		// have to be careful about accepting data via the messaging API you
		// create. Check that source, and validate those inputs!
		if (e.origin === "null" && e.source === iframe.contentWindow) {
		    alert('Result: ' + e.data);
		}
	    });
	    // Note that we're sending the message to "*", rather than some specific
            // origin. Sandboxed iframes which lack the 'allow-same-origin' header
            // don't have an origin which you can target: you'll have to send to any
            // origin, which might alow some esoteric attacks. Validate your output!
            iframe.contentWindow.postMessage("Hey", '*');
	},
    reload: function() {
        console.log("in reload");
          this.iframeSource = "/sandbox/web-viewer/index.html";//props.name;
      },
        updateCurrentFileData: function() {
            if (this.file == null)
                return;
            if (this.file.isDirectory())
                return;
            var props = this.file.getFileProperties();
            var that = this;

            let pathPrefix = '/app/' + this.currentDir.getFileProperties().name + '/';
            this.showSpinner = true;
            //if(that.supportsStreaming()) {
                function StreamWrapper(context, pathPrefix) {
                    this.context = context;
                    this.maxBlockSize = 1024 * 1024 * 5;
                    this.writer = null;
                    this.pathPrefix = pathPrefix;
                    this.readInFile = function(filePath, file) {
                        var props = file.getFileProperties();
                        var work = function(thatRef) {
                            var currentSize = props.sizeLow();
                            var blockSize = currentSize > this.maxBlockSize ? this.maxBlockSize : currentSize;
                            var pump = function(reader, header) {
                                if(blockSize > 0) {
                                    var bytes = new Uint8Array(blockSize + header.byteLength);
                                    for(i=0;i < header.byteLength;i++){
                                        bytes[i] = header[i];
                                    }
                                    var data = convertToByteArray(bytes);
                                    data.length = blockSize + header.byteLength;
                                    reader.readIntoArray(data, header.byteLength, blockSize).thenApply(function(read){
                                           currentSize = currentSize - read;
                                           blockSize = currentSize > thatRef.maxBlockSize ? thatRef.maxBlockSize : currentSize;
                                           thatRef.writer.write(data);
                                           pump(reader, header);
                                    });
                                }
                            }
                            file.getInputStream(thatRef.context.network, thatRef.context.crypto, props.sizeHigh(), props.sizeLow(), function(read) {}).thenCompose(function(reader) {
                               let encoder = new TextEncoder();
                               let uint8Array = encoder.encode(filePath);

                               var filePathByte = new Uint8Array(1);
                               filePathByte[0] = uint8Array.byteLength;//todo len > 255
                               const combinedSize = filePathByte.byteLength + uint8Array.byteLength;
                               var header = new Uint8Array(combinedSize);
                               header.set(filePathByte);
                               header.set(uint8Array, filePathByte.byteLength);
                                pump(reader, header);
                            });
                        }
                        work(this);
                    }
                    this.readFile = function(filePath) {
                        console.log("filePath=" + filePath)
                        let that = this;
                        this.context.getByPath(that.context.username + filePath).thenApply(function(fileOpt){
                            let file = fileOpt.get();
                            that.readInFile(filePath, file)
                        }).exceptionally(function(throwable) {
                            console.log("in here throwable=" + throwable);
                        });
                    }
                }
                const wrapper = new StreamWrapper(this.context, pathPrefix);
                let fileStream = streamSaver.createWriteStream("web-viewer-" + pathPrefix, "text/html", function(url){
                        that.showSpinner = false;
                        that.iframeSource = pathPrefix + props.name;
                    }, function(seekHi, seekLo, seekLength){
                        //nothing
                    }, undefined, 0
                    ,function(filePath){
                        wrapper.readFile(filePath)
                    }
                )
                wrapper.writer = fileStream.getWriter()
        },
        close: function () {
            this.$emit("hide-pdf-viewer");
        }
    },
}
