use strict;
use warnings;
use feature ':5.16';

use Log::Message::Simple qw[msg error debug croak carp cluck confess];

use constant VERBOSE => 1;

use Data::Dumper;
use JSON;
use LWP::UserAgent;

local $/;
open( my $fh, '<', 'data.js' );
my $json_text   = <$fh>;
my $pops = decode_json( $json_text );
open(my $fh2, '>', 'data.min.js');
say $fh2 to_json($pops);
open (my $fh3, '>', 'data.places.js');
say $fh3 '[';

# https://developers.google.com/places/documentation/actions
for my $pop (@$pops) {
	say $pop->{'address'} . "::" . $pop->{'geodata'}->{'geometry'}->{'location_type'} . "::" . $pop->{'geodata'}->{'formatted_address'};
	if (!$pop->{'place_ref'}) {
		$pop = add_place($pop);
		say $fh3 to_json($pop, {pretty=>1}) . ',';
	}
}
say $fh3 ']';


sub add_place {
	my $pop = shift;
	my $uri = 'https://maps.googleapis.com/maps/api/place/add/json?sensor=false&key=AIzaSyDXzEqJNIaU_aWf9lDkdzNRCIEOiyyLizs';
	my $data = {
		'location'	=> $pop->{'geodata'}->{'geometry'}->{'location'},
		'accuracy'	=> 50,
		'name'		=> 'POP space at ' . $pop->{'name'} . " " . $pop->{'address'},
		'types'		=> ['other'],
		'language'	=> 'en'
	};
	my $json = to_json($data);
	#die $json;
	my $tries = 0;
	while ($tries < 3) {
		my $req = HTTP::Request->new( 'POST', $uri );
		$req->header( 'Content-Type' => 'application/json' );
		$req->content( $json );
		my $ua = LWP::UserAgent->new;
		my $response = $ua->request($req);
		if ($response->is_success) {
			my $jstext = $response->content;
			say $jstext;
			my $json_resp = decode_json($jstext);
			if ($json_resp->{'status'} eq 'OK') {
				delete $json_resp->{'status'};
				msg("Got OK response", VERBOSE);
				$pop->{'place_ref'} = $json_resp;
				return $pop;
			}
			msg("Got status " . $json_resp->{'status'} . ", will try again in 2s", VERBOSE);
			sleep 2;
		} else {
			die $response->message;
		}
		$tries++;
	}
}