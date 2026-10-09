from app.live.composition import Word, read_composition, teams_from
from app.live.session import LiveSession


def loading_screen_words():
    """Écran de chargement simulé : alliés en haut, adversaires en bas, pseudo puis héros."""
    top = [("Moi", "Li Li"), ("Bnizzle", "Valla"), ("Domino", "Le Boucher"), ("LiteKnight", "Xal'atath"), ("AngryLobster", "Diablo")]
    bottom = [("XiaoPiHai", "Lumiaile"), ("Kappa", "Johanna"), ("silvanas", "Gul'dan"), ("Bar", "Sergent Marteau"), ("Baz", "Cho")]
    words = [Word("HÉROS", 0.5, 0.02)]
    for row_y, row in ((0.30, top), (0.75, bottom)):
        for i, (player, hero) in enumerate(row):
            x = 0.12 + i * 0.19
            words.append(Word(player, x, row_y))
            parts = hero.split(" ")
            for j, part in enumerate(parts):
                words.append(Word(part, x - 0.02 * (len(parts) - 1) + 0.04 * j, row_y + 0.04))
    return words


def test_reads_both_team_compositions_from_loading_screen():
    lobby = ["Moi#1234", "Bnizzle#1", "Domino#2", "LiteKnight#3", "AngryLobster#4",
             "XiaoPiHai#5", "Kappa#6", "silvanas#7", "Bar#8", "Baz#9"]
    entries = read_composition(loading_screen_words(), lobby, {"moi"})
    teams = teams_from(entries)
    assert teams["complete"] and teams["sides_known"]
    assert [h["hero_id"] for h in teams["ally"]] == ["lili", "valla", "butcher", "xalatath", "diablo"]
    assert [h["hero_id"] for h in teams["enemy"]] == ["brightwing", "johanna", "guldan", "sgthammer", "cho"]
    assert teams["ally"][0]["me"] and teams["ally"][3]["role"] == "Ranged Assassin"


def test_ocr_typos_tolerated_and_composition_accumulates():
    s = LiveSession()
    s.on_lobby(["Moi#1", "Bnizzle#2"], None, None, None)
    entries = read_composition([Word("Moi", 0.1, 0.3), Word("Vala", 0.1, 0.34),  # « Valla » mal lu
                                Word("Bnizzle", 0.1, 0.75), Word("Johana", 0.1, 0.79)], s.lobby_players, {"moi"})
    s.add_composition(entries)
    teams = s.snapshot()["teams"]
    assert teams["ally"][0]["hero_id"] == "valla" and teams["enemy"][0]["hero_id"] == "johanna"
    assert not teams["complete"]
