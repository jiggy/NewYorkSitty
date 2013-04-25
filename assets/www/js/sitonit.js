var sitonit = {}; // namespace
sitonit.map = function(mapOptions) { // main class for the map of POPs
	
	// Default position and zoom captures lower Manhattan and downtown Brooklyn
    var defaultMapOptions = mapOptions || {
      center: new google.maps.LatLng(40.730218,-73.973351),
      zoom: 13,
      mapTypeId: google.maps.MapTypeId.ROADMAP
    };
	
	var gmap = undefined; // reference to google.maps.Map object
	var geocoder = new google.maps.Geocoder();
	var directionsDisplay = new google.maps.DirectionsRenderer();
	var directionsService = new google.maps.DirectionsService();
	$.Mustache.addFromDom(); 

	var markers = []; // store list of placed markers because Google API doesn't do it for you
	var centroid;
	
	// thank you Pythagoras
	function computeDistance(pointA, pointB) {
		return Math.pow(pointB.lat() - pointA.lat(), 2) +
			Math.pow(pointB.lng() - pointA.lng(), 2);
	}
	
	// maintain list of POPs in sorted order with a fixed list size
	function insertSorted(list, item, limit) {
		var i = 0;
		while (i < list.length) {
			if (item.distance < list[i].distance) {
				// item is smaller than an item in the list, so insert it
				list.splice(i, 0, item);
				break;
			}
			i++;
		}
		if (list.length < limit) {
			// not yet at limit, so put it on the end
			list.push(item);
			return true;
		} else if (list.length > limit) {
			// inserted an item that expanded the list over the limit, so drop the highest value
			list.pop();
			return true;
		}
		return false; // nothing was inserted
	}
	// Search the DB for nearest POPs from center point
	function findClosest(center/* LatLng */, callback) {
		centroid = center;
		console.info("Finding POPs near", center);
		var limit = 10;
		var closest = [];
		$(pops).each(function(i, pop) {
			var popCoords = pop.geodata.geometry.location; // {lat:,lng:}
			var dist = computeDistance(center, new google.maps.LatLng(popCoords.lat, popCoords.lng));
			pop.distance = dist;
			insertSorted(closest, pop, limit);
		});
		console.info("Closest", closest);
		callback(center, closest);
	}
	var openWindows = [];
	function openWindow(marker) {
		closeWindows();
		var infoWindow = marker.info;
		infoWindow.open(marker.map, marker);
		openWindows.push(infoWindow);
	}
	function closeWindows() {
		$(openWindows).each(function(i, win) {
			win.close();
		});
	}
	return {
		showRoute : function(destination) {
			var req = {
				travelMode: google.maps.TravelMode.WALKING,
				origin: centroid,
				destination: destination
			};
			directionsService.route(req, function(result, status) {
				console.log("status", status);
				console.log("results", result);
		        if (status == google.maps.DirectionsStatus.OK) {
		        	directionsDisplay.setDirections(result);
		        }
			});
		},
		initMap: function(div) {
			console.info("Adding map to", div);
		    gmap = new google.maps.Map(div, defaultMapOptions);
		    this.map = gmap;
			directionsDisplay.setMap(gmap);
		    return this;
		},
		showCentroid: function(center) {
			console.log("center",center);
			markers.push(new google.maps.Marker({
				map: gmap,
				position: center,
				title: "START"
			}));
		},
		addPop: function(pop) {
			if (!gmap) return;
			var coords = pop.geodata.geometry.location;
			var pos = new google.maps.LatLng(coords.lat, coords.lng);
			var marker = new google.maps.Marker({
				map: gmap,
				position: pos,
				title:(pop.name ? pop.name + " " : "") + pop.address,
				icon: 'img/poplogo_icon_16X16.png'
			});
			var node = $($.Mustache.render('poppop', {
				name:pop.name,
				address:pop.address,
				description:pop.location,
				lat:pos.lat(),
				lng:pos.lng()
			}));
			marker.info = new google.maps.InfoWindow({
				  content: node.show().get(0)
				});
			google.maps.event.addListener(marker, 'click', function() {
					openWindow(marker);
				});
			markers.push(marker);
		},
		findByAddress: function(address, callback, resultsCallback) {
			console.info("Finding address ", address);
			if (address) {
				geocoder.geocode( { 'address': address}, function(results, status) {
					console.debug("Geocode status: ", status);
					console.debug("Results, ", results);
					if (results.length > 1) {
						console.info("Multiple results", results);
						// check if one of the alternate results is an exact match
						var match = false;
						for (var i = 0; i < results.length; i++) {
							if (results[0].formatted_address == address) {
								match = true;
								break;
							}
						}
						if (!match) {
							resultsCallback(results);
						}
					}
					var center = results[0].geometry.location;
					findClosest(center, callback);
				});
			} else {
				console.info("Getting phone's position");
				navigator.geolocation.getCurrentPosition(function(position) {
					console.info("Position: ", position);
					var center = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
					findClosest(center, callback);
				},
				function(error) {
					console.warn("Failed to retrieve current position", error);
				},{enableHighAccuracy:true,maximumAge:60000,timeout:5000});	
			}
		},
		setBoundsByMarkers: function() {
			var bounds = new google.maps.LatLngBounds(); 
			$(markers).each(function(i, marker) {
				bounds.extend(marker.position);
			});	
			gmap.fitBounds(bounds);
		},
		clearMarkers: function() {
			for(var i = 0; i < markers.length; i++) {
				markers[i].setMap(null);
			}
			markers = [];
		}
	};
};