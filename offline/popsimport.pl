use strict;
use warnings;
use feature ':5.16';

use Archive::Extract;
use Log::Message::Simple qw[msg error debug croak carp cluck confess];
use LWP::Simple;

use constant VERBOSE => 1;
use constant POPS_URL => "https://nycopendata.socrata.com/download/fum3-ejky/application/zip";
use DBI;
use DBD::ODBC;

use Data::Dumper;
use Text::xSV;
use JSON;
use LWP::UserAgent;

my $location_types = { "ROOFTOP" => 100, "RANGE_INTERPOLATED" => 80, "GEOMETRIC_CENTER" => 60, "APPROXIMATE" => 20};

sub geocode_address {
	my $address = shift;
	my $district = shift;
	my $ua = LWP::UserAgent->new();
	msg("Fetching " . $address, VERBOSE);
	my $address_param = $address . " New York, NY" =~ s/ /+/gr;
	my $borough = "Manhattan";
	if ($district =~ /^B/) {
		$borough = "Brooklyn";
	} elsif ($district =~ /^Q/) {
		$borough = "Queens";
	}
	my $geocode_url = "http://maps.googleapis.com/maps/api/geocode/json?sensor=false&components=locality:" . $borough . "&address=" . $address_param;
	msg("Querying with $geocode_url", VERBOSE);

	my $tries = 0;
	while ($tries < 3) {
		my $response = $ua->get($geocode_url);
		if ($response->is_success) {
			my $geodata = from_json $response->decoded_content;
			if ($geodata->{'status'} eq 'OVER_QUERY_LIMIT') {
				$tries++;
				croak("GMap daily query limit exceeded") if $tries == 3;
				carp("Querying too fast, try again in 2s", VERBOSE);
				sleep 2;
				next;
			} elsif ($geodata->{'status'} eq 'OK') {
				msg("Query returned OK", VERBOSE);
				return $geodata;
			} else {
				croak("GMaps returned bad status" . $geodata->{'status'});
			}
		}
		else {
			croak("GMap returned bad HTTP response: " . $response->status_line);
		}
	}
}

open my $file, ">data.json";
say $file "";
my $csv = Text::xSV->new();
$csv->open_file("tbl_POPS.txt");
$csv->read_header();
while ($csv->get_row()) {
	my ($district, $address, $name, $location, @ps) = $csv->extract(
		"Community District", "Building Address","Building Name","Building Location","Public Space 1","PS 1 Size","Public Space 2","PS 2 Size","Public Space 3","PS 3 Size","Public Space 4","PS 4 Size","Public Space 5","PS 5 Size");
	$name ||= "";
	my %spaces = map {$_ ? $_ : ""} @ps;
	
	my $geodata = geocode_address($address, $district);
	
	my $results = $geodata->{'results'};
	my $top_result;
	if ($#$results > 0) {
		msg("Received multiple results", VERBOSE);
		for my $res (@$results) {
			msg("Potential address is " . $res->{'formatted_address'} . ", type: " . $res->{'geometry'}->{'location_type'}, VERBOSE);
		}
		# sort by quality of location type and return first
		my @results = sort {$location_types->{$a->{'geometry'}->{'location_type'}} <=> $location_types->{$b->{'geometry'}->{'location_type'}}} @$results;
		$top_result = $results[0];
	} else {
		$top_result = $results->[0];
	}
	if ($top_result->{'geometry'}->{'location_type'} ne 'ROOFTOP') {
		carp("Result is not a ROOFTOP");
	}
	say $file to_json({'name'=>$name,'address'=>$address,'location'=>$location,"spaces"=>\%spaces, "geodata" => $top_result}, {pretty=>1}) . ",";
}
say $file "]";

sub fetch_data {
	my $zip_stash = "pops.zip";
	my $mdb_stash = "popsdb";
	msg("Fetching " . POPS_URL, VERBOSE);
	my $data = getstore(POPS_URL, $zip_stash);
	msg("Inflating zip", VERBOSE);
	my $mdbzip = Archive::Extract->new(archive => $zip_stash);
	unlink $mdb_stash;
	my $ok = $mdbzip->extract(to => $mdb_stash);
	unlink $zip_stash;
	die unless $ok;
	msg("MDB created at " . $mdb_stash, VERBOSE);
	return glob("$mdb_stash/*.mdb");
}