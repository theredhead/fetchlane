#!/usr/bin/env python3
import argparse
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = {
    "Objecten": "www.kadaster.nl/schemas/lvbag/imbag/objecten/v20200601",
    "Objecten-ref": "www.kadaster.nl/schemas/lvbag/imbag/objecten-ref/v20200601",
    "Historie": "www.kadaster.nl/schemas/lvbag/imbag/historie/v20200601",
    "gml": "http://www.opengis.net/gml/3.2",
}

OPR_TAG = f"{{{NS['Objecten']}}}OpenbareRuimte"
NUM_TAG = f"{{{NS['Objecten']}}}Nummeraanduiding"
VBO_TAG = f"{{{NS['Objecten']}}}Verblijfsobject"
WPL_TAG = f"{{{NS['Objecten']}}}Woonplaats"


def q(ns: str, name: str) -> str:
    return f"{{{NS[ns]}}}{name}"


def text(elem: ET.Element, path: str):
    value = elem.findtext(path)
    if value is None:
        return None
    value = value.strip()
    return value or None


def current(elem: ET.Element) -> bool:
    return (
        elem.find(f".//{q('Historie', 'eindGeldigheid')}") is None
        and elem.find(f".//{q('Historie', 'eindRegistratie')}") is None
    )


def normalize(value):
    if value is None:
        return r"\N"
    return str(value).replace("\t", " ").replace("\n", " ").replace("\r", " ")


def write_row(handle, values):
    handle.write("\t".join(normalize(value) for value in values))
    handle.write("\n")


def iter_objects(zip_path: Path, target_tag: str):
    with zipfile.ZipFile(zip_path) as archive:
        xml_names = [name for name in archive.namelist() if name.endswith(".xml")]
        for name in xml_names:
            with archive.open(name) as xml_file:
                context = ET.iterparse(xml_file, events=("start", "end"))
                _, root = next(context)
                for event, elem in context:
                    if event == "end" and elem.tag == target_tag:
                        yield elem
                        elem.clear()
                        root.clear()


def export_openbareruimte(opr_zip: Path, output_path: Path):
    count = 0
    with output_path.open("w", encoding="utf-8") as handle:
        for elem in iter_objects(opr_zip, OPR_TAG):
            if not current(elem):
                continue
            if text(elem, f"./{q('Objecten', 'type')}") != "Weg":
                continue
            if text(elem, f"./{q('Objecten', 'status')}") != "Naamgeving uitgegeven":
                continue

            write_row(
                handle,
                [
                    text(elem, f"./{q('Objecten', 'identificatie')}"),
                    text(elem, f"./{q('Objecten', 'naam')}"),
                    text(elem, f"./{q('Objecten', 'type')}"),
                    text(elem, f"./{q('Objecten', 'status')}"),
                    text(elem, f".//{q('Objecten-ref', 'WoonplaatsRef')}"),
                ],
            )
            count += 1
    return count


def export_nummeraanduiding(num_zip: Path, output_path: Path):
    count = 0
    with output_path.open("w", encoding="utf-8") as handle:
        for elem in iter_objects(num_zip, NUM_TAG):
            if not current(elem):
                continue
            if text(elem, f"./{q('Objecten', 'status')}") != "Naamgeving uitgegeven":
                continue

            write_row(
                handle,
                [
                    text(elem, f"./{q('Objecten', 'identificatie')}"),
                    text(elem, f"./{q('Objecten', 'huisnummer')}"),
                    text(elem, f"./{q('Objecten', 'huisletter')}"),
                    text(elem, f"./{q('Objecten', 'huisnummertoevoeging')}"),
                    text(elem, f"./{q('Objecten', 'postcode')}"),
                    text(elem, f"./{q('Objecten', 'typeAdresseerbaarObject')}"),
                    text(elem, f"./{q('Objecten', 'status')}"),
                    text(elem, f".//{q('Objecten-ref', 'OpenbareRuimteRef')}"),
                ],
            )
            count += 1
    return count


def export_verblijfsobject(vbo_zip: Path, output_path: Path):
    count = 0
    with output_path.open("w", encoding="utf-8") as handle:
        for elem in iter_objects(vbo_zip, VBO_TAG):
            if not current(elem):
                continue

            status = text(elem, f"./{q('Objecten', 'status')}") or ""
            if "in gebruik" not in status.lower():
                continue

            pos = text(elem, f".//{q('gml', 'pos')}")
            if pos is None:
                continue
            coords = pos.split()
            if len(coords) < 2:
                continue

            write_row(
                handle,
                [
                    text(elem, f"./{q('Objecten', 'identificatie')}"),
                    text(elem, f".//{q('Objecten-ref', 'NummeraanduidingRef')}"),
                    coords[0],
                    coords[1],
                    status,
                    text(elem, f"./{q('Objecten', 'oppervlakte')}"),
                ],
            )
            count += 1
    return count


def export_woonplaats(wpl_zip: Path, output_path: Path):
    count = 0
    with output_path.open("w", encoding="utf-8") as handle:
        for elem in iter_objects(wpl_zip, WPL_TAG):
            if not current(elem):
                continue
            if text(elem, f"./{q('Objecten', 'status')}") != "Woonplaats aangewezen":
                continue

            write_row(
                handle,
                [
                    text(elem, f"./{q('Objecten', 'identificatie')}"),
                    text(elem, f"./{q('Objecten', 'naam')}"),
                    text(elem, f"./{q('Objecten', 'status')}"),
                ],
            )
            count += 1
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--opr-zip", required=True)
    parser.add_argument("--num-zip", required=True)
    parser.add_argument("--vbo-zip", required=True)
    parser.add_argument("--wpl-zip", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    counts = {
        "bag_openbareruimte.tsv": export_openbareruimte(
            Path(args.opr_zip), output_dir / "bag_openbareruimte.tsv"
        ),
        "bag_nummeraanduiding.tsv": export_nummeraanduiding(
            Path(args.num_zip), output_dir / "bag_nummeraanduiding.tsv"
        ),
        "bag_verblijfsobject.tsv": export_verblijfsobject(
            Path(args.vbo_zip), output_dir / "bag_verblijfsobject.tsv"
        ),
        "bag_woonplaats.tsv": export_woonplaats(
            Path(args.wpl_zip), output_dir / "bag_woonplaats.tsv"
        ),
    }

    for filename, count in counts.items():
        print(f"{filename}: {count}", file=sys.stderr)


if __name__ == "__main__":
    main()
