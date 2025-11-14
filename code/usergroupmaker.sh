#!/bin/bash

# A full-menu script to manage HUMAN users and groups.
# Must be run as root.

if [ "$(id -u)" -ne 0 ]; then
   echo "This script must be run as root. Try: sudo usermgr" >&2
   exit 1
fi

# --- Utility Function ---
pause() {
    echo ""
    read -p "Press [Enter] to return to the menu..."
}

# --- USER FUNCTIONS ---
fn_list_users() {
    echo "--- Human Users (UID 1000+) With a Home Directory ---"

    local found_user=0
    # Read /etc/passwd line by line
    # Format: username:password_x:UID:GID:description:home_dir:shell
    while IFS=: read -r username password uid gid desc home_dir shell; do

        # Check if UID is 1000 or greater
        if [ "$uid" -ge 1000 ]; then

            # Check if home directory field is not empty AND it actually exists as a directory
            if [ -n "$home_dir" ] && [ -d "$home_dir" ]; then
                echo "$username (Home: $home_dir)"
                found_user=1
            fi
        fi
    done < /etc/passwd

    if [ "$found_user" -eq 0 ]; then
        echo "No human users with home directories found."
        echo "Use Option 2 (Create New User) to add one."
    fi
}

fn_create_user() {
    read -p "Enter new username: " username
    if [ -z "$username" ]; then echo "Error: No username entered."; return; fi
    if id "$username" &>/dev/null; then echo "Error: User '$username' already exists."; return; fi

    # -m flag creates the home directory
    useradd -m -s /bin/bash "$username"
    if [ $? -eq 0 ]; then
        echo "User '$username' and home directory created successfully."
        echo "--- Now, set password for $username ---"
        passwd "$username"
    else
        echo "Error: Failed to create user '$username'."
    fi
}

fn_delete_user() {
    read -p "Enter username to DELETE: " username
    if [ -z "$username" ]; then echo "Error: No username entered."; return; fi
    if ! id "$username" &>/dev/null; then echo "Error: User '$username' does not exist."; return; fi
    if [ "$username" = "root" ]; then echo "Error: Cannot delete 'root' user."; return; fi

    read -p "REALLY delete '$username' and all their files? (y/n): " confirm
    if [ "$confirm" = "y" ]; then
        # --remove-home deletes the home directory
        deluser --remove-home "$username"
        echo "User '$username' and their home directory removed."
    else
        echo "Action cancelled."
    fi
}

fn_set_password() {
    read -p "Enter username to set/change password for: " username
    if [ -z "$username" ]; then echo "Error: No username entered."; return; fi
    if ! id "$username" &>/dev/null; then echo "Error: User '$username' does not exist."; return; fi

    echo "--- Setting password for $username ---"
    passwd "$username"
}

# --- GROUP FUNCTIONS ---
fn_list_groups() {
    echo "--- All Groups ---"
    cut -d: -f1 /etc/group | sort
}

fn_list_user_groups() {
    read -p "Enter username: " username
    if [ -z "$username" ]; then echo "Error: No username entered."; return; fi
    if ! id "$username" &>/dev/null; then echo "Error: User '$username' does not exist."; return; fi

    echo "--- Groups for $username ---"
    groups "$username"
}

fn_list_group_users() {
    read -p "Enter groupname: " groupname
    if [ -z "$groupname" ]; then echo "Error: No groupname entered."; return; fi
    if ! getent group "$groupname" &>/dev/null; then echo "Error: Group '$groupname' does not exist."; return; fi

    echo "--- Members of group '$groupname' ---"
    PRIMARY_USERS=$(getent passwd | awk -F: -v gname="$groupname" 'BEGIN{ g_id=systab["/etc/group", gname, 3] } $4==g_id {print $1}')
    SECONDARY_USERS=$(getent group "$groupname" | awk -F: '{print $4}' | tr ',' '\n')

    ALL_USERS=$(echo -e "$PRIMARY_USERS\n$SECONDARY_USERS" | grep -v "^\s*$" | sort -u)

    if [ -z "$ALL_USERS" ]; then
        echo "Group '$groupname' has no members."
    else
        echo "$ALL_USERS"
    fi
}

fn_create_group() {
    read -p "Enter new groupname: " groupname
    if [ -z "$groupname" ]; then echo "Error: No groupname entered."; return; fi
    if getent group "$groupname" &>/dev/null; then echo "Error: Group '$groupname' already exists."; return; fi

    groupadd "$groupname"
    echo "Group '$groupname' created."
}

fn_delete_group() {
    read -p "Enter groupname to DELETE: " groupname
    if [ -z "$groupname" ]; then echo "Error: No groupname entered."; return; fi
    if ! getent group "$groupname" &>/dev/null; then echo "Error: Group '$groupname' does not exist."; return; fi

    # Check if group has members
    if [ -n "$(getent group "$groupname" | awk -F: '{print $4}')" ] || \
       getent passwd | awk -F: -v gname="$groupname" 'BEGIN{ g_id=systab["/etc/group", gname, 3] } $4==g_id {print $1}' | grep -q .; then
        echo "Error: Cannot delete group '$groupname'. It is not empty or is a primary group."
        echo "Use 'list-group-users $groupname' to see members."
        return
    fi

    read -p "REALLY delete group '$groupname'? (y/n): " confirm
    if [ "$confirm" = "y" ]; then
        groupdel "$groupname"
        echo "Group '$groupname' deleted."
    else
        echo "Action cancelled."
    fi
}

# --- MEMBER FUNCTIONS ---
fn_add_user_to_group() {
    read -p "Enter username: " username
    if [ -z "$username" ]; then echo "Error: No username."; return; fi
    if ! id "$username" &>/dev/null; then echo "Error: User '$username' does not exist."; return; fi

    read -p "Enter groupname to add to: " groupname
    if [ -z "$groupname" ]; then echo "Error: No groupname."; return; fi

    if ! getent group "$groupname" &>/dev/null; then
        read -p "Group '$groupname' does not exist. Create it? (y/n): " create_choice
        if [ "$create_choice" = "y" ]; then
            groupadd "$groupname"
            echo "Group '$groupname' created."
        else
            echo "Action cancelled."
            return
        fi
    fi

    usermod -aG "$groupname" "$username"
    echo "User '$username' added to group '$groupname'."
    echo "New groups for $username:"
    groups "$username"
}

fn_remove_user_from_group() {
    read -p "Enter username: " username
    if [ -z "$username" ]; then echo "Error: No username."; return; fi
    if ! id "$username" &>/dev/null; then echo "Error: User '$username' does not exist."; return; fi

    read -p "Enter groupname to remove from: " groupname
    if [ -z "$groupname" ]; then echo "Error: No groupname."; return; fi
    if ! getent group "$groupname" &>/dev/null; then echo "Error: Group '$groupname' does not exist."; return; fi

    gpasswd -d "$username" "$groupname"
    echo "User '$username' removed from group '$groupname'."
    echo "New groups for $username:"
    groups "$username"
}


# --- MAIN MENU LOOP ---
while true; do
    clear
    echo "--- User & Group Manager Menu ---"
    echo ""
    echo "[--- USERS ---]"
    echo " 1. List Users (with home dir)"
    echo " 2. Create New User (with home dir)"
    echo " 3. Delete User (with home dir)"
    echo ""
    echo "[--- GROUPS ---]"
    echo " 4. List All Groups"
    echo " 5. List a User's Groups"
    echo " 6. List a Group's Users"
    echo " 7. Create New Group"
    echo " 8. Delete Group"
    echo ""
    echo "[--- MEMBERSHIP ---]"
    echo " 9. Add User to Group"
    echo " 10. Remove User from Group"
    echo ""
    echo "[--- ADMIN ---]"
    echo " 11. Set / Change a User's Password"
    echo ""
    echo " 0. Exit"
    echo "-----------------------------------"
    read -p "Enter option (0-11): " choice

    # Clear screen for a clean output
    clear
    echo "--- Executing Option $choice ---"

    case "$choice" in
        1) fn_list_users ;;
        2) fn_create_user ;;
        3) fn_delete_user ;;
        4) fn_list_groups ;;
        5) fn_list_user_groups ;;
        6) fn_list_group_users ;;
        7) fn_create_group ;;
        8) fn_delete_group ;;
        9) fn_add_user_to_group ;;
        10) fn_remove_user_from_group ;;
        11) fn_set_password ;;
        0) echo "Exiting."; exit 0 ;;
        *) echo "Invalid option. Try again." ;;
    esac

    pause
done
