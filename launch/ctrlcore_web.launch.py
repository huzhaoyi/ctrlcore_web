import os

from launch import LaunchDescription
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory


def generate_launch_description():
    pkg = get_package_share_directory("sealien_ctrlcore_web")
    params = os.path.join(pkg, "config", "web_modules.yaml")
    return LaunchDescription([
        Node(
            package="sealien_ctrlcore_web",
            executable="ctrlcore_web_node",
            name="ctrlcore_web_node",
            output="screen",
            parameters=[params],
        ),
    ])
