# Sets title and author on the built PDF without touching page content.
import sys
from pypdf import PdfReader, PdfWriter

path = sys.argv[1]
writer = PdfWriter(clone_from=PdfReader(path))
writer.add_metadata({'/Title': 'Silvio di Rubbo, CV', '/Author': 'Silvio di Rubbo', '/Subject': 'Curriculum vitae'})
writer.compress_identical_objects()
with open(path, 'wb') as f:
    writer.write(f)
