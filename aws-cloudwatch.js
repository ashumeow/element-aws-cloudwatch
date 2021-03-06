      function hoursAgo(n) {
      var ago = new Date();
      ago.setHours(ago.getHours() - n);
      return ago;
    }

    function capitalise(s) {
      return s.slice(0, 1).toUpperCase() + s.slice(1);
    }

    function roundTo(x, base) {
      return base * Math.max(1, Math.round(x / base));
    }

    function asDate(dateish) {
      var date;
      if (dateish instanceof Date) {
        date = dateish;
      } else {
        // Optimistically convert String/Number to date
        date = new Date(dateish);
      }
      return date;
    }

    function computePeriod(start, end, resolution) {
      var rangeInMillis = end - start;
      var rangeInSecs = rangeInMillis / 1000;
      var targetPeriod = Math.round(rangeInSecs / resolution);
      // period must be a multiple of 60
      return roundTo(targetPeriod, 60);
    }

    function queryCloudWatch(cloudWatch, queryParams, callback) {
      var attrs = queryParams.Statistics;
      var query = {
        // boring...
        Namespace:  queryParams.Namespace,
        MetricName: queryParams.MetricName,
        Dimensions: queryParams.Dimensions,
        StartTime:  queryParams.StartTime,
        EndTime:    queryParams.EndTime,
        Period:     queryParams.Period,
        Statistics: queryParams.Statistics
      };

      cloudWatch.getMetricStatistics(query, callback);
    }

    Polymer('aws-cloudwatch', {
      observe: {
        // Note: needed in case the config will be ready later
        // FIXME: is this causing unnecessary re-fetches?
        config: 'changeConfigAndUpdate',
        namespace: 'update',
        metricname: 'update',
        starttime: 'update',
        endtime: 'update',
        resolution: 'update',
        statistics: 'update'
      },

      // TODO: document properties

      /**
       * The read-only `sink` attribute exports the CloudWatch statistics data.
       * The object is keyed by the statistics names.
       * The data is an array of [Date, value] pairs.
       *
       * @attribute sink
       * @type Object
       */


      /* == Internal methods == */

      update: function() {
        // Abort if the config is not ready yet
        if (! this.config) {
          return;
        }

        // memoize
        if (! this.cloudwatch) {
          this.cloudwatch = new AWS.CloudWatch(this.config);
        }

        var dimNodes = this.querySelectorAll('aws-dimension');
        var dimensions = [].slice.call(dimNodes).map(function(dimNode) {
          return {
            Name: dimNode.getAttribute('name'),
            Value: dimNode.getAttribute('value')
          };
        });

        var start  = asDate(this.starttime);
        var end    = asDate(this.endtime);
        var period = computePeriod(start, end, this.resolution);

        var statistics = this.statistics.split(' ').map(capitalise);
        this.cloudwatch.getMetricStatistics({
            Namespace:  this.namespace,
            MetricName: this.metricname,
            Dimensions: dimensions,
            StartTime:  start.toISOString(),
            EndTime:    end.toISOString(),
            Period:     period, // seconds
            Statistics: statistics
        }, function(err, data) {
            this.sink = statistics.reduce(function(all, stat) {
              all[stat.toLowerCase()] = data.Datapoints.map(function(point) {
                return [point.Timestamp, point[stat]];
              }).sort(function(a, b) {
                // data may come out of order
                return a[0] - b[0];
              });
              return all;
            }, {});
        }.bind(this));
      },

      changeConfigAndUpdate: function() {
        // Delete any memoized client
        delete this.cloudwatch;
        this.update();
      }
    });
