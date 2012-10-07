var sitonit = {}; // namespace
sitonit.map = function() { // main class for the map of POPs
	var map; // reference to google.maps.Map object
	var geocoder = new google.maps.Geocoder();
	var markers = []; // store list of placed markers because Google API doesn't do it for you
	
	// thank you Pythagoras
	function computeDistance(pointA, pointB) {
		return Math.pow(pointB.lat()-pointA.lat(), 2) + Math.pow(pointB.lng()-pointA.lng(), 2);
	}
	
	// maintain list of POPs in sorted order with a fixed limit
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
		return false;
	}
	// Search the DB for nearest POPs from center point
	function findClosest(center/* LatLng*/, callback) {
		console.log(center);
		var limit = 10;
		var closest = [];
		$(pops).each(function(i, pop) {
			var popCoords = pop.geodata.results[0].geometry.location; // {lat:,lng:}
			console.log("Computing distance to " + pop.address + "[" + popCoords.lat + "," + popCoords.lng + "]");
			var dist = computeDistance(center, new google.maps.LatLng(popCoords.lat, popCoords.lng));
			console.log("Distance is " + dist);
			pop.distance = dist;
			insertSorted(closest, pop, limit);
		});
		console.log(closest);
		callback(closest);

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
		initMap: function(div) {
			console.log("Adding map to " + div);
		    var mapOptions = {
		      center: new google.maps.LatLng(40.730218,-73.973351),
		      zoom: 13,
		      mapTypeId: google.maps.MapTypeId.ROADMAP
		    };
		    map = new google.maps.Map(div, mapOptions);
		    console.log(map);
		    return this;
		},
		addPop: function(pop) {
			if (!map) return;
			var coords = pop.geodata.results[0].geometry.location;
			var marker = new google.maps.Marker({
				map: map,
				position: new google.maps.LatLng(coords.lat, coords.lng),
				title:(pop.name ? pop.name + " " : "") + pop.address,
				icon: 'img/poplogo_icon_16X16.png'
			});
			var node = $(".info-window").clone();
			if (pop.name) {
				node.find(".name").text(pop.name);
			}
			if (pop.address) {
				node.find(".address").text(pop.address);
			}
			if (pop.location) {
				node.find(".description").text(pop.location);
			}
			marker.info = new google.maps.InfoWindow({
				  content: node.show().get(0)
				});
			google.maps.event.addListener(marker, 'click', function() {
					openWindow(marker);
				});
			markers.push(marker);
		},
		findByAddress: function(address, callback) {
			console.log("Finding address " + address);
			if (address) {
				geocoder.geocode( { 'address': address}, function(results, status) {
					console.log("Geocode status: " + status);
					var coords = results[0].geometry.location; // LatLng object
					findClosest(coords, callback);
				});
			} else {
				console.log("Getting phone's position");
				navigator.geolocation.getCurrentPosition(function(position) {
					console.log("Position: " + position);
					findClosest(new google.maps.LatLng(position.coords.latitude, position.coords.longitude), callback);
				},
				function(error) {
					console.log("Failed to retrieve current position");
				});
			}
		},
		setBoundsByMarkers: function() {
			var bounds = new google.maps.LatLngBounds();
			$(markers).each(function(i, marker) {
				bounds.extend(marker.position);
			});	
			map.fitBounds(bounds);
		},
		clearMarkers: function() {
			for(var i = 0; i < markers.length; i++) {
				markers[i].setMap(null);
			}
			markers = [];
		}
	};
};