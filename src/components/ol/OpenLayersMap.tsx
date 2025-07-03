import React, { useEffect, useRef, useState } from "react";
import "ol/ol.css";
import { Map, Overlay, View } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Style, Circle, Fill, Stroke } from "ol/style";
import { locationsData, YearData } from "../../generated/data";

const OpenLayersMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [selectedLocation, setSelectedLocation] = useState<{
    name: string;
    year: string;
    data: YearData;
  } | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const vectorLayer = new VectorLayer({
      source: new VectorSource(),
    });

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat([10, 63]),
        zoom: 5,
      }),
    });

    const overlay = new Overlay({
      element: document.getElementById("popup") as HTMLElement,
      positioning: "bottom-center",
      stopEvent: false,
    });
    map.addOverlay(overlay);

    // Add markers for each location
    locationsData.forEach((location) => {
      const coords: [number, number] = [
        Number(location.coordinates[0]),
        Number(location.coordinates[1]),
      ];
      const marker = new Feature({
        geometry: new Point(fromLonLat(coords)),
      });
      marker.set("data", location);
      marker.setStyle(
        new Style({
          image: new Circle({
            radius: 10,
            fill: new Fill({ color: "red" }),
            stroke: new Stroke({ color: "white", width: 2 }),
          }),
        }),
      );
      vectorLayer.getSource()?.addFeature(marker);
    });

    // Register click handler
    map.on("click", (event) => {
      const feature = map.forEachFeatureAtPixel(
        event.pixel,
        (feature) => feature,
      );
      if (feature) {
        const locationData = feature.get("data");
        if (locationData) {
          const year = Object.keys(locationData.years)[0];
          const yearData = locationData.years[year];
          setSelectedLocation({
            name: locationData.name,
            year,
            data: yearData,
          });
          overlay.setPosition(fromLonLat(locationData.coordinates));
        }
      } else {
        setSelectedLocation(null);
      }
    });

    return () => map.setTarget(undefined);
  }, []);

  return (
    <div>
      <div ref={mapRef} style={{ width: "100%", height: "400px" }} />
      <div id="popup" className="ol-popup">
        {selectedLocation && (
          <div>
            <h3>{selectedLocation.name}</h3>
            <p>Year: {selectedLocation.year}</p>
            {selectedLocation.data.productionOil && (
              <p>Oil Production: {selectedLocation.data.productionOil} units</p>
            )}
            {selectedLocation.data.productionGas && (
              <p>Gas Production: {selectedLocation.data.productionGas} units</p>
            )}
            {selectedLocation.data.emission && (
              <p>Emissions: {selectedLocation.data.emission} tons</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OpenLayersMap;
